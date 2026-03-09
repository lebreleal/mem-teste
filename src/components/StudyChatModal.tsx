/**
 * Ephemeral AI chat modal for the study view.
 * History is lost on close. Uses the same ai-chat edge function.
 */

import { useState, useCallback, useRef, useEffect, type MutableRefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Brain, Send, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import AIModelSelector from '@/components/AIModelSelector';
import ProModelConfirmDialog from '@/components/ProModelConfirmDialog';
import ReactMarkdown from 'react-markdown';

const BASE_COST = 2;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface StudyChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional context from the current card */
  cardContext?: { front: string; back: string };
  /** External streaming response (e.g. from ai-tutor explain) shown as first assistant message */
  streamingResponse?: string | null;
  /** Whether the external streaming is still in progress */
  isStreamingResponse?: boolean;
  /** Called when the streaming response has been consumed into local messages */
  onClearStreaming?: () => void;
  /** When this key changes, messages are reset (e.g. card change) */
  resetKey?: string | number;
  /** Callback to inform parent whether the chat has messages */
  onHasMessagesChange?: (has: boolean) => void;
  /** Ref that parent can call to clear messages (for re-explain) */
  clearRef?: MutableRefObject<(() => void) | null>;
}

const StudyChatModal = ({ open, onOpenChange, cardContext, streamingResponse, isStreamingResponse, onClearStreaming, resetKey, onHasMessagesChange, clearRef }: StudyChatModalProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { energy } = useEnergy();
  const { model, setModel, getCost, pendingPro, confirmPro, cancelPro } = useAIModel();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cost = getCost(BASE_COST);

  // Only reset streaming state when modal closes (preserve messages)
  useEffect(() => {
    if (!open) {
      setIsStreaming(false);
    }
  }, [open]);

  // Absorb external streaming response into local messages
  const absorbedRef = useRef<string | null>(null);

  // Reset messages when card changes (resetKey)
  useEffect(() => {
    setMessages([]);
    setInput('');
    setIsStreaming(false);
    absorbedRef.current = null;
  }, [resetKey]);

  // Expose clear function to parent via ref
  useEffect(() => {
    if (clearRef) {
      clearRef.current = () => {
        setMessages([]);
        absorbedRef.current = null;
      };
    }
  }, [clearRef]);

  // Notify parent about messages state
  useEffect(() => {
    onHasMessagesChange?.(messages.length > 0);
  }, [messages.length, onHasMessagesChange]);

  useEffect(() => {
    if (!open) return;
    if (streamingResponse && !isStreamingResponse && absorbedRef.current !== streamingResponse) {
      absorbedRef.current = streamingResponse;
      setMessages(prev => [...prev, { role: 'assistant', content: streamingResponse }]);
      onClearStreaming?.();
      // Auto-scroll to show the new absorbed message
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [open, streamingResponse, isStreamingResponse, onClearStreaming]);

  // Auto-scroll when user sends a message OR when a new assistant message appears
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (scrollRef.current && messages.length > prevMsgCount.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (energy < cost) {
      toast({ title: 'Créditos insuficientes', description: `Você precisa de ${cost} Créditos IA.`, variant: 'destructive' });
      return;
    }

    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    try {
      // Build messages with card context as system hint
      const systemContext = cardContext
        ? `O usuário está estudando um flashcard. Frente: "${cardContext.front.replace(/<[^>]*>/g, '').slice(0, 500)}". Verso: "${cardContext.back.replace(/<[^>]*>/g, '').slice(0, 500)}". Responda dúvidas sobre este conteúdo.`
        : '';

      const apiMessages = [
        ...(systemContext ? [{ role: 'system' as const, content: systemContext }] : []),
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ];

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || '';

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: apiMessages,
          aiModel: model,
          energyCost: cost,
          skipPersist: true, // Don't save to DB
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao consultar IA');
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let textBuffer = '';
      let streamDone = false;

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              const snapshot = assistantContent;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: snapshot } : m);
                }
                return [...prev, { role: 'assistant', content: snapshot }];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Flush any remaining buffer content
      if (textBuffer.trim()) {
        const remaining = textBuffer.trim();
        if (remaining.startsWith('data: ') && remaining.slice(6).trim() !== '[DONE]') {
          try {
            const parsed = JSON.parse(remaining.slice(6).trim());
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m));
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
      setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.content === '')));
    } finally {
      setIsStreaming(false);
      // Refresh energy in header after spending credits
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
  }, [input, isStreaming, energy, cost, messages, model, cardContext, toast, queryClient]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg h-[80dvh] flex flex-col p-0 gap-0 [&>button.absolute]:hidden overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Brain className="h-4 w-4 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-display font-semibold text-sm leading-tight">Chat IA</span>
                {cardContext && (
                  <span className="text-[10px] text-muted-foreground truncate leading-tight">Contexto: conteúdo do card atual</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AIModelSelector model={model} onChange={setModel} baseCost={BASE_COST} compact />
              <button
                onClick={() => onOpenChange(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !streamingResponse && !isStreamingResponse && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground px-6">
                <Brain className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Tire dúvidas sobre este card</p>
                <p className="text-xs mt-1 leading-relaxed">O chat está contextualizado com o conteúdo do cartão que você está estudando</p>
                <p className="text-[11px] mt-2 opacity-60">O histórico é mantido enquanto estiver neste card</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' ? (
                  <div className="max-w-[92%]">
                    {msg.content ? (
                      <div className="ai-prose">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-primary text-primary-foreground">
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                )}
              </div>
            ))}
            {/* Loading indicator when AI is thinking but no content yet */}
            {isStreamingResponse && !streamingResponse && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-muted text-foreground">
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
                    <span className="text-xs text-muted-foreground">Gerando explicação...</span>
                  </div>
                </div>
              </div>
            )}
            {/* Live streaming response at the end */}
            {streamingResponse && absorbedRef.current !== streamingResponse && (
              <div className="flex justify-start">
                <div className="max-w-[92%]">
                  <div className="ai-prose">
                    <ReactMarkdown>{streamingResponse}</ReactMarkdown>
                    {isStreamingResponse && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-2.5">
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua pergunta..."
                className="min-h-[40px] max-h-[100px] resize-none border-0 bg-muted/50 focus-visible:ring-0 text-base sm:text-sm"
                rows={1}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || isStreaming || energy < cost}
                className="h-9 w-9 shrink-0"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ProModelConfirmDialog open={pendingPro} onConfirm={confirmPro} onCancel={cancelPro} baseCost={BASE_COST} />
    </>
  );
};

export default StudyChatModal;
