import { useState, useCallback, useRef, useEffect } from 'react';
import { Brain, Send, Loader2, Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createAIConversation, saveAIChatMessage, deleteAIConversation, getAuthToken } from '@/services/adminService';
import { useToast } from '@/hooks/use-toast';
import { useEnergy } from '@/hooks/useEnergy';
import { useAIModel } from '@/hooks/useAIModel';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import AIModelSelector from '@/components/AIModelSelector';
import ProModelConfirmDialog from '@/components/ProModelConfirmDialog';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const BASE_COST = 2;

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const AIAgent = () => {
  const { toast } = useToast();
  const { energy } = useEnergy();
  const { model, setModel, getCost, pendingPro, confirmPro, cancelPro } = useAIModel();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cost = getCost(BASE_COST);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  const loadConversations = async () => {
    const { fetchAIConversations } = await import('@/services/adminService');
    const data = await fetchAIConversations(user!.id);
    setConversations(data);
  };

  const justCreatedRef = useRef(false);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    // Skip reload when we just created this conversation (messages are already in state)
    if (justCreatedRef.current) {
      justCreatedRef.current = false;
      return;
    }
    loadMessages(activeConversationId);
  }, [activeConversationId]);

  const loadMessages = async (convId: string) => {
    const { fetchAIChatMessages } = await import('@/services/adminService');
    const data = await fetchAIChatMessages(convId);
    setMessages(data.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })));
  };

  // Auto-scroll only when user sends a new message (not on every streaming update)
  const lastUserMsgCount = useRef(0);
  useEffect(() => {
    const userMsgCount = messages.filter(m => m.role === 'user').length;
    if (scrollRef.current && userMsgCount > lastUserMsgCount.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastUserMsgCount.current = userMsgCount;
  }, [messages]);

  const createConversation = async (firstMessage: string): Promise<string> => {
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : '');
    const data = await createAIConversation(user!.id, title);
    setConversations(prev => [data, ...prev]);
    return data.id;
  };

  const saveMessage = async (convId: string, role: string, content: string) => {
    await saveAIChatMessage(convId, user!.id, role, content);
  };

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
      let convId = activeConversationId;
      if (!convId) {
        convId = await createConversation(text);
        justCreatedRef.current = true;
        setActiveConversationId(convId);
      }

      await saveMessage(convId, 'user', text);

      const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const token = await getAuthToken();

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
          conversationId: convId,
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
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: snapshot };
                return updated;
              });
            }
          } catch {
            // incomplete JSON, keep in buffer
          }
        }
      }

      // Flush remaining buffer
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) assistantContent += content;
          } catch {}
        }
        if (assistantContent) {
          const final = assistantContent;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: final };
            return updated;
          });
        }
      }

      if (assistantContent) {
        await saveMessage(convId, 'assistant', assistantContent);
      }

      // Refresh energy after server-side deduction
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao consultar IA', variant: 'destructive' });
      setMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'assistant' && !prev[prev.length - 1].content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, messages, energy, cost, model, activeConversationId, user, isStreaming, queryClient]);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversationId(conv.id);
    if (isMobile) setSidebarOpen(false);
  };

  const handleDeleteConversation = async (convId: string) => {
    await deleteAIConversation(convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConversationId === convId) {
      setActiveConversationId(null);
      setMessages([]);
    }
    setDeleteConvId(null);
  };

  const handleClearAll = async () => {
    setClearAllConfirm(false);
    for (const conv of conversations) {
      await deleteAIConversation(conv.id);
    }
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    toast({ title: 'Histórico limpo!' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] bg-background">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && isMobile && (
        <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "z-[70] h-[calc(100dvh-4rem)] border-r border-border bg-card flex flex-col shrink-0 transition-[width] duration-200 ease-in-out",
        isMobile
          ? cn("fixed top-auto bottom-16 left-0 w-72", sidebarOpen ? "translate-x-0" : "-translate-x-full")
          : cn("relative", sidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0")
      )}>
        <div className="p-3 border-b border-border flex items-center gap-2 min-w-[18rem]">
          <Button onClick={handleNewChat} className="flex-1 gap-2" variant="outline" size="sm">
            <Plus className="h-4 w-4" />
            Nova conversa
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 min-w-[18rem]">
          <div className="p-2 space-y-1">
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors group cursor-pointer",
                  activeConversationId === conv.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConvId(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-opacity shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nenhuma conversa ainda
              </p>
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t border-border space-y-2 min-w-[18rem]">
          {conversations.length > 0 && (
            <Button variant="ghost" size="sm" className="w-full gap-2 text-destructive hover:text-destructive text-xs" onClick={() => setClearAllConfirm(true)}>
              <Trash2 className="h-3 w-3" />
              Limpar todo histórico
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            Saldo: {energy} Créditos IA
          </p>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSidebarOpen(true)}>
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
              <Brain className="h-5 w-5" style={{ color: 'hsl(var(--energy-purple, 270 70% 60%))' }} />
              <h1 className="font-display text-lg font-bold text-foreground">Agente IA</h1>
            </div>
            <AIModelSelector model={model} onChange={setModel} baseCost={BASE_COST} compact />
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <Brain className="h-16 w-16 mb-4 opacity-20" style={{ color: 'hsl(var(--energy-purple, 270 70% 60%))' }} />
              <h2 className="text-xl font-bold text-foreground mb-2">Olá! Como posso ajudar?</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Tire dúvidas sobre qualquer matéria, peça resumos, explicações ou ajuda com exercícios. Custa {cost} créditos por mensagem.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-3", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'hsl(var(--energy-purple, 270 70% 60%) / 0.15)' }}>
                      <Brain className="h-4 w-4" style={{ color: 'hsl(var(--energy-purple, 270 70% 60%))' }} />
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div className="max-w-[90%]">
                      <div className="ai-prose">
                        <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl rounded-br-md px-4 py-3 text-sm max-w-[85%] leading-relaxed bg-primary text-primary-foreground">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  )}
                </div>
              ))}
              {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                    Pensando...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm p-4">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              className="min-h-[44px] max-h-[160px] resize-none rounded-xl"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="shrink-0 rounded-xl h-11 w-11"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            {cost} créditos por mensagem · Modelo {model === 'flash' ? 'Flash' : 'Pro'}
          </p>
        </div>
      </div>

      {/* Delete single conversation */}
      <AlertDialog open={!!deleteConvId} onOpenChange={v => !v && setDeleteConvId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>Esta conversa e todas as mensagens serão excluídas permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConvId && handleDeleteConversation(deleteConvId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear all history */}
      <AlertDialog open={clearAllConfirm} onOpenChange={setClearAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todo histórico?</AlertDialogTitle>
            <AlertDialogDescription>Todas as conversas serão excluídas permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Limpar tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProModelConfirmDialog open={pendingPro} onConfirm={confirmPro} onCancel={cancelPro} baseCost={BASE_COST} />
    </div>
  );
};

export default AIAgent;
