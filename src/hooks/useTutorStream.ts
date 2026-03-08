/**
 * Extracted from Study.tsx — SSE streaming logic for the AI tutor.
 * Encapsulates the entire fetch→parse→stream pipeline.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TutorStreamOptions {
  action?: string;
  mcOptions?: string[];
  correctIndex?: number;
  selectedIndex?: number;
}

export function useTutorStream(energy: number, model: string, tutorCost: number, cardKey: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [hintResponse, setHintResponse] = useState<string | null>(null);
  const [explainResponse, setExplainResponse] = useState<string | null>(null);
  const [mcExplainResponse, setMcExplainResponse] = useState<string | null>(null);
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const tutorAbortRef = useRef<AbortController | null>(null);

  // Reset tutor state when card changes
  useEffect(() => {
    setHintResponse(null);
    setExplainResponse(null);
    setMcExplainResponse(null);
    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
      tutorAbortRef.current = null;
    }
    setIsTutorLoading(false);
  }, [cardKey]);

  const handleTutorRequest = useCallback(async (
    currentCard: { front_content: string; back_content: string } | null,
    options?: TutorStreamOptions,
  ) => {
    if (!currentCard || energy < tutorCost) return;
    if (tutorAbortRef.current) tutorAbortRef.current.abort();
    const controller = new AbortController();
    tutorAbortRef.current = controller;

    const isMcExplain = options?.action === 'explain-mc';
    const isExplain = options?.action === 'explain';
    const setter = isMcExplain ? setMcExplainResponse : isExplain ? setExplainResponse : setHintResponse;

    setIsTutorLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || '';

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          frontContent: currentCard.front_content,
          backContent: currentCard.back_content,
          action: options?.action,
          mcOptions: options?.mcOptions,
          correctIndex: options?.correctIndex,
          selectedIndex: options?.selectedIndex,
          aiModel: model,
          energyCost: tutorCost,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao consultar IA');
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let content = '';
      let textBuffer = '';
      let streamDone = false;

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
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) { content += delta; setter(content); }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) { content += delta; setter(content); }
          } catch { /* ignore */ }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      if (controller.signal.aborted) return;
      toast({ title: 'Erro ao consultar o Tutor', description: err.message, variant: 'destructive' });
    } finally {
      if (!controller.signal.aborted) setIsTutorLoading(false);
    }
  }, [energy, model, tutorCost, queryClient, toast]);

  const abortTutor = useCallback(() => {
    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
      tutorAbortRef.current = null;
    }
    setIsTutorLoading(false);
  }, []);

  return {
    hintResponse,
    explainResponse,
    mcExplainResponse,
    isTutorLoading,
    handleTutorRequest,
    abortTutor,
  };
}
