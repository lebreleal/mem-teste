/**
 * Ephemeral AI chat modal for the study view.
 * History is lost on close. Uses the same ai-chat edge function.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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
}

const StudyChatModal = ({ open, onOpenChange, cardContext }: StudyChatModalProps) => {
  const { toast } = useToast();
  const { energy } = useEnergy();
  const { model, setModel, getCost, pendingPro, confirmPro, cancelPro } = useAIModel();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cost = getCost(BASE_COST);

  // Reset messages when modal closes
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput('');
      setIsStreaming(false);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
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
          if (jsonStr === '[DONE]') break;

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
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
      setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.content === '')));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, energy, cost, messages, model, cardContext, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg h-[80vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-sm">Chat IA</span>
            </div>
            <div className="flex items-center gap-2">
              <AIModelSelector model={model} onChange={setModel} baseCost={BASE_COST} compact />
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Brain className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Faça uma pergunta sobre o card</p>
                <p className="text-xs mt-1">O histórico será perdido ao fechar</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
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
                className="min-h-[40px] max-h-[100px] resize-none border-0 bg-muted/50 focus-visible:ring-0 text-sm"
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
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              {cost} créditos por mensagem • {energy} disponíveis
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <ProModelConfirmDialog open={pendingPro} onConfirm={confirmPro} onCancel={cancelPro} baseCost={BASE_COST} />
    </>
  );
};

export default StudyChatModal;
