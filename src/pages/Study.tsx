import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudySession } from '@/hooks/useStudySession';
import { useEnergy } from '@/hooks/useEnergy';
import { getNextReadyIndex, parseStepToMinutes } from '@/lib/studyUtils';
import { useAIModel } from '@/hooks/useAIModel';
import { invalidateStudyQueries } from '@/lib/queryKeys';
import AIModelSelector from '@/components/AIModelSelector';
import FlashCard from '@/components/FlashCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Brain, Moon, Sun, Timer } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import StudyCardActions from '@/components/StudyCardActions';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Rating } from '@/lib/fsrs';

const ProModelConfirmDialog = lazy(() => import('@/components/ProModelConfirmDialog'));
const StudyChatModal = lazy(() => import('@/components/StudyChatModal'));

const FAST_THRESHOLD_MS = 3000;
const BASE_TUTOR_COST = 2;

/** Get IDs of cloze siblings (same front_content, different card) from queue */
function getSiblingIds(card: any, queue: any[]): string[] {
  if (card.card_type !== 'cloze') return [];
  return queue
    .filter(c => c.id !== card.id && c.card_type === 'cloze' && c.front_content === card.front_content)
    .map(c => c.id);
}

const Study = () => {
  const { deckId, folderId } = useParams<{ deckId?: string; folderId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { queue, isLoading, isFetching, submitReview, algorithmMode, isLiveDeck, deckConfig } = useStudySession(deckId ?? '', folderId);
  const { theme, toggleTheme } = useTheme();
  const { energy, addSuccessfulCard } = useEnergy();
  const { model, setModel, getCost, pendingPro, confirmPro, cancelPro } = useAIModel();
  const goBack = useCallback(() => {
    // Invalidate study queue so deck detail reloads fresh stats
    invalidateStudyQueries(queryClient);
    if (deckId) {
      navigate(`/decks/${deckId}`, { replace: true });
    } else if (folderId) {
      navigate(`/dashboard?folder=${folderId}`, { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [deckId, folderId, navigate, queryClient]);
  const TUTOR_COST = getCost(BASE_TUTOR_COST);

  // Local queue: cards that failed go back to end with updated scheduled_date
  const [localQueue, setLocalQueue] = useState<any[]>([]);
  const [queueInitialized, setQueueInitialized] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [cardKey, setCardKey] = useState(0);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [learningTick, setLearningTick] = useState(0);
  // Track unique card IDs reviewed to compute accurate progress
  const [initialQueueSize, setInitialQueueSize] = useState(0);
  const reviewedCardIdsRef = useRef(new Set<string>());

  const cardShownAt = useRef<number>(Date.now());
  const fastWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainScrollRef = useRef<HTMLElement>(null);

  // Reset scroll position when card changes
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [cardKey]);

  const [hintResponse, setHintResponse] = useState<string | null>(null);
  const [explainResponse, setExplainResponse] = useState<string | null>(null);
  const [mcExplainResponse, setMcExplainResponse] = useState<string | null>(null);
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [explainInChat, setExplainInChat] = useState<string | false>(false);
  const [chatHasMessages, setChatHasMessages] = useState(false);
  const chatClearRef = useRef<(() => void) | null>(null);

  // Undo state: store the previous queue snapshot + reviewCount + card DB state
  const [undoSnapshot, setUndoSnapshot] = useState<{
    queue: any[];
    reviewCount: number;
    cardKey: number;
    cardId: string;
    prevCardState: { stability: number; difficulty: number; state: number; scheduled_date: string; last_reviewed_at: string | null };
  } | null>(null);

  // Initialize local queue from fetched data (once)
  useEffect(() => {
    if (queue.length > 0 && !queueInitialized) {
      setLocalQueue([...queue]);
      setInitialQueueSize(queue.length);
      setQueueInitialized(true);
    }
  }, [queue, queueInitialized]);

  // Bug fix: clear stale study-queue cache on unmount so re-entering
  // the study page always fetches fresh data from the server.
  const studyQueueKey = useMemo(
    () => ['study-queue', folderId ? `folder-${folderId}` : deckId],
    [deckId, folderId],
  );
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: studyQueueKey });
    };
  }, [queryClient, studyQueueKey]);

  // getNextReadyIndex imported from studyUtils

  const [isTransitioning, setIsTransitioning] = useState(false);
  // Determine current card considering learning step timing
  const readyIndex = useMemo(() => getNextReadyIndex(localQueue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localQueue, waitingSeconds, learningTick]);
  const nextCard = readyIndex >= 0 ? localQueue[readyIndex] : null;

  // Lock the displayed card — only update when cardKey changes (user rated) or during init.
  // Using queueInitialized ensures displayedCard is set on first load so the
  // volatile `nextCard` fallback is never used during an active review.
  const [displayedCard, setDisplayedCard] = useState<any>(null);
  useEffect(() => {
    if (!isTransitioning) {
      setDisplayedCard(nextCard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, isTransitioning, queueInitialized]);
  const currentCard = displayedCard ?? nextCard;

  // Force re-render when the soonest learning card's timer expires
  useEffect(() => {
    const now = Date.now();
    const futureTimes = localQueue
      .filter(c => c.state === 1 || c.state === 3)
      .map(c => new Date(c.scheduled_date).getTime())
      .filter(t => t > now);
    if (futureTimes.length === 0) return;
    const soonest = Math.min(...futureTimes);
    const delay = soonest - now + 100;
    const timer = setTimeout(() => setLearningTick(prev => prev + 1), delay);
    return () => clearTimeout(timer);
  }, [localQueue]);
  const allWaiting = localQueue.length > 0 && readyIndex < 0;

  // Countdown timer when all remaining cards are in learning steps
  useEffect(() => {
    if (!allWaiting) { setWaitingSeconds(0); return; }
    const now = Date.now();
    const soonest = Math.min(...localQueue.map(c => new Date(c.scheduled_date).getTime()));
    const remaining = Math.max(0, Math.ceil((soonest - now) / 1000));
    setWaitingSeconds(remaining);

    // If already ready (scheduled_date in the past), force immediate recomputation
    if (remaining <= 0) {
      setLearningTick(prev => prev + 1);
      return;
    }

    const interval = setInterval(() => {
      const r = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
      setWaitingSeconds(r);
      if (r <= 0) { clearInterval(interval); setLearningTick(prev => prev + 1); }
    }, 1000);
    return () => clearInterval(interval);
  }, [allWaiting, localQueue]);

  // Progress based on cards that LEFT the queue (graduated or removed)
  const cardsCompleted = initialQueueSize - localQueue.length;
  const progressPercent = initialQueueSize > 0
    ? Math.min(100, (cardsCompleted / initialQueueSize) * 100)
    : 0;

  const tutorAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHintResponse(null);
    setExplainResponse(null);
    setMcExplainResponse(null);
    // Cancel any pending tutor request when card changes
    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
      tutorAbortRef.current = null;
    }
    setIsTutorLoading(false);
  }, [cardKey]);

  useEffect(() => {
    return () => {
      if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current);
    };
  }, []);

  // Open chat modal when first streaming content arrives for explain-in-chat
  const activeStreamingResponse = explainInChat === 'explain-mc' ? mcExplainResponse : explainInChat === 'explain' ? explainResponse : null;
  useEffect(() => {
    if (explainInChat && activeStreamingResponse && !chatOpen) {
      setChatOpen(true);
    }
  }, [explainInChat, activeStreamingResponse, chatOpen]);

  const handleTutorRequest = useCallback(async (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => {
    if (!currentCard || energy < TUTOR_COST) return;
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
          energyCost: TUTOR_COST,
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
            if (delta) {
              content += delta;
              const snapshot = content;
              setter(snapshot);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Flush any remaining buffer
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
            if (delta) {
              content += delta;
              setter(content);
            }
          } catch { /* ignore partial leftovers */ }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['energy'] });
    } catch (err: any) {
      if (controller.signal.aborted) return;
      toast({ title: 'Erro ao consultar o Tutor', description: err.message, variant: 'destructive' });
    } finally {
      if (!controller.signal.aborted) setIsTutorLoading(false);
    }
  }, [currentCard, energy, toast, model, TUTOR_COST, queryClient]);

  // isTransitioning moved earlier (before currentCard computation)

  // Guard against double-submission of the same card
  const submittingRef = useRef<string | null>(null);

  const handleRate = useCallback((rating: Rating) => {
    if (!currentCard || isTransitioning) return;
    // Prevent double-click on the same card
    if (submittingRef.current === currentCard.id) return;
    submittingRef.current = currentCard.id;

    // Save undo snapshot before modifying (including card DB state for revert)
    setUndoSnapshot({
      queue: [...localQueue],
      reviewCount,
      cardKey,
      cardId: currentCard.id,
      prevCardState: {
        stability: currentCard.stability,
        difficulty: currentCard.difficulty,
        state: currentCard.state,
        scheduled_date: currentCard.scheduled_date,
        last_reviewed_at: currentCard.last_reviewed_at ?? null,
      },
    });
    // Cancel any pending tutor request so it doesn't block
    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
      tutorAbortRef.current = null;
    }
    setIsTutorLoading(false);
    const elapsed = Date.now() - cardShownAt.current;

    if (elapsed < FAST_THRESHOLD_MS) {
      if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current);
      fastWarningTimer.current = setTimeout(() => {}, 3000);
    }

    if (rating > 2) {
      addSuccessfulCard.mutate({ flowMultiplier: 1.0 });
    }

    // ── OPTIMISTIC UPDATE: update local queue IMMEDIATELY ──
    // Heuristic: Again(1) always stays in session; Hard(2) on learning stays;
    // everything else graduates/removes. This matches FSRS & SM-2 behavior 100%.
    const shouldKeep = rating === 1 || (rating === 2 && currentCard.state !== 2);

    reviewedCardIdsRef.current.add(currentCard.id);
    setReviewCount(prev => prev + 1);

    if (shouldKeep) {
      // Estimate scheduled_date from deck learning steps
      const steps = deckConfig?.learning_steps ?? ['1', '10'];
      const currentStep = currentCard.learning_step ?? 0;
      const stepIdx = rating === 1 ? 0 : Math.min(currentStep + 1, steps.length - 1);
      const stepStr = steps[stepIdx] ?? '1';
      const stepMinutes = parseStepToMinutes(stepStr);
      const estimatedDate = new Date(Date.now() + stepMinutes * 60 * 1000).toISOString();
      const estimatedState = rating === 1 && currentCard.state === 2 ? 3 : (currentCard.state === 0 ? 1 : currentCard.state);

      setLocalQueue(prev => {
        const idx = prev.findIndex(c => c.id === currentCard.id);
        if (idx < 0) return prev;
        const updatedCard = {
          ...prev[idx],
          state: estimatedState,
          scheduled_date: estimatedDate,
          learning_step: stepIdx,
        };
        const without = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        return [...without, updatedCard];
      });
    } else {
      // Remove from session + bury cloze siblings
      const buriedSiblingIds: string[] = [];
      setLocalQueue(prev => {
        let filtered = prev.filter(c => c.id !== currentCard.id);
        if (currentCard.card_type === 'cloze') {
          const buryNew = deckConfig?.bury_new_siblings !== false;
          const buryReview = deckConfig?.bury_review_siblings !== false;
          const buryLearning = deckConfig?.bury_learning_siblings !== false;
          if (buryNew || buryReview || buryLearning) {
            const siblingIds = getSiblingIds(currentCard, filtered);
            if (siblingIds.length > 0) {
              filtered = filtered.filter(c => {
                if (!siblingIds.includes(c.id)) return true;
                if (c.state === 0 && buryNew) { buriedSiblingIds.push(c.id); return false; }
                if (c.state === 2 && buryReview) { buriedSiblingIds.push(c.id); return false; }
                if ((c.state === 1 || c.state === 3) && buryLearning) { buriedSiblingIds.push(c.id); return false; }
                return true;
              });
            }
          }
        }
        return filtered;
      });
      if (buriedSiblingIds.length > 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        supabase.from('cards').update({ scheduled_date: tomorrow.toISOString() } as any).in('id', buriedSiblingIds);
      }
    }

    // Advance card immediately — no waiting for DB
    setCardKey(prev => prev + 1);
    cardShownAt.current = Date.now();
    submittingRef.current = null;

    // ── ASYNC DB PERSIST ──
    submitReview.mutate(
      { card: currentCard, rating, elapsedMs: elapsed },
      {
        onSuccess: (result) => {
          // Patch learning card with real algorithm values (stability, difficulty, scheduled_date)
          if (shouldKeep && result.interval_days === 0) {
            setLocalQueue(prev => prev.map(c =>
              c.id === currentCard.id
                ? {
                    ...c,
                    state: result.state,
                    stability: result.stability,
                    difficulty: result.difficulty,
                    scheduled_date: result.scheduled_date,
                    learning_step: result.learning_step ?? 0,
                  }
                : c
            ));
          }
        },
      }
    );
  }, [currentCard, isTransitioning, submitReview, addSuccessfulCard, localQueue, reviewCount, cardKey, deckConfig]);

  const handleUndo = useCallback(async () => {
    if (!undoSnapshot) return;
    // Revert local state
    setLocalQueue(undoSnapshot.queue);
    setReviewCount(undoSnapshot.reviewCount);
    setCardKey(undoSnapshot.cardKey);
    // Remove the undone card from reviewed set if it wasn't in the snapshot queue as already-reviewed
    reviewedCardIdsRef.current.delete(undoSnapshot.cardId);
    setUndoSnapshot(null);

    // Revert card in DB to previous state
    try {
      await supabase
        .from('cards')
        .update({
          stability: undoSnapshot.prevCardState.stability,
          difficulty: undoSnapshot.prevCardState.difficulty,
          state: undoSnapshot.prevCardState.state,
          scheduled_date: undoSnapshot.prevCardState.scheduled_date,
          last_reviewed_at: undoSnapshot.prevCardState.last_reviewed_at,
        } as any)
        .eq('id', undoSnapshot.cardId);

      // Delete the most recent review_log for this card
      const { data: logs } = await supabase
        .from('review_logs')
        .select('id')
        .eq('card_id', undoSnapshot.cardId)
        .order('reviewed_at', { ascending: false })
        .limit(1);
      if (logs && logs.length > 0) {
        await supabase.from('review_logs').delete().eq('id', logs[0].id);
      }

      // Revert energy/stats counters
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
    } catch {
      toast({ title: 'Erro ao desfazer no banco', variant: 'destructive' });
    }
  }, [undoSnapshot, queryClient, toast]);

  if (isLoading || (!queueInitialized && isFetching)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!currentCard && !allWaiting && reviewCount > 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="animate-fade-in text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Sessão Completa!</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Você revisou <span className="font-bold text-primary">{reviewCount}</span> {reviewCount === 1 ? 'card' : 'cards'} hoje.
          </p>
           <Button onClick={goBack} className="mt-8 gap-2">
             <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  // All remaining cards are learning and waiting for their step timer
  if (allWaiting) {
    const mins = Math.floor(waitingSeconds / 60);
    const secs = waitingSeconds % 60;
    const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="animate-fade-in text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Brain className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Aguardando repetição</h1>
          <p className="mt-2 text-muted-foreground">
            {localQueue.length} {localQueue.length === 1 ? 'card está' : 'cards estão'} em aprendizado.
          </p>
          <p className="mt-4 text-4xl font-bold text-primary tabular-nums">{timeStr}</p>
          <p className="mt-1 text-xs text-muted-foreground">até o próximo card</p>
          <Button variant="outline" onClick={goBack} className="mt-8 gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="animate-fade-in text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">Nenhum card para estudar</h1>
          <p className="mt-2 text-muted-foreground">Adicione cards ao baralho ou volte mais tarde.</p>
          <Button variant="outline" onClick={goBack} className="mt-6 gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background overflow-hidden">
      <header className="sticky top-0 z-20 bg-background flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3">
        <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-pomodoro'))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Pomodoro"
          >
            <Timer className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1 rounded-xl px-2 py-1" style={{ background: 'hsl(var(--energy-purple) / 0.1)' }}>
            <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple))' }} />
            <span className="text-xs font-bold text-foreground tabular-nums">{energy}</span>
          </div>
          <AIModelSelector model={model} onChange={setModel} baseCost={BASE_TUTOR_COST} compact />
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{cardsCompleted}/{initialQueueSize}</span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-muted/40">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progressPercent}%`,
            background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`,
            borderRadius: '0 4px 4px 0',
          }}
        />
      </div>

      <main ref={mainScrollRef} className="flex flex-1 min-h-0 items-center justify-center px-2 sm:px-4 py-2 sm:py-4 overflow-y-auto">
        <div key={cardKey} className="w-full animate-fade-in">
          <FlashCard
            cardId={currentCard.id}
            frontContent={currentCard.front_content}
            backContent={currentCard.back_content}
            stability={currentCard.stability}
            difficulty={currentCard.difficulty}
            state={currentCard.state}
            scheduledDate={currentCard.scheduled_date}
            lastReviewedAt={currentCard.last_reviewed_at}
            cardType={currentCard.card_type}
            learningStep={currentCard.learning_step ?? 0}
            onRate={handleRate}
            isSubmitting={submitReview.isPending || isTransitioning}
            quickReview={algorithmMode === 'quick_review'}
            algorithmMode={algorithmMode}
            deckConfig={deckConfig}
            energy={energy}
            tutorCost={TUTOR_COST}
            onTutorRequest={handleTutorRequest}
            isTutorLoading={isTutorLoading}
            hintResponse={hintResponse}
            explainResponse={explainResponse}
            mcExplainResponse={mcExplainResponse}
            canUndo={!!undoSnapshot}
            onUndo={handleUndo}
            onOpenExplainChat={(options) => {
              const action = options?.action || 'explain';
              // Reset response states
              if (action === 'explain') setExplainResponse(null);
              if (action === 'explain-mc') setMcExplainResponse(null);
              setExplainInChat(action);
              // Clear old messages for fresh explanation
              chatClearRef.current?.();
              // Don't open modal yet — it opens when content arrives (via useEffect)
              handleTutorRequest(options || { action: 'explain' });
            }}
            actions={
              <StudyCardActions
                card={currentCard}
                isLiveDeck={isLiveDeck}
              onCardUpdated={(updatedFields) => {
                  setLocalQueue(prev => prev.map(c => c.id === currentCard.id ? { ...c, ...updatedFields } : c));
                  // Update displayedCard directly so the edit is visible
                  // WITHOUT bumping cardKey (which would swap to a queued learning card)
                  setDisplayedCard(prev => prev && prev.id === currentCard.id ? { ...prev, ...updatedFields } : prev);
                }}
                onCardFrozen={() => { setLocalQueue(prev => prev.filter(c => c.id !== currentCard.id)); setCardKey(prev => prev + 1); }}
                onCardBuried={() => {
                  // Remove this card + cloze siblings from the local queue
                  setLocalQueue(prev => {
                    let filtered = prev.filter(c => c.id !== currentCard.id);
                    if (currentCard.card_type === 'cloze') {
                      const sibIds = getSiblingIds(currentCard, filtered);
                      if (sibIds.length > 0) {
                        // Bury siblings in DB too
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(0, 0, 0, 0);
                        sibIds.forEach(sid => {
                          supabase.from('cards').update({ scheduled_date: tomorrow.toISOString() }).eq('id', sid).then(() => {});
                        });
                        filtered = filtered.filter(c => !sibIds.includes(c.id));
                      }
                    }
                    return filtered;
                  });
                  setCardKey(prev => prev + 1);
                }}
                onSiblingsUpdated={(updates, deletedIds) => {
                  setLocalQueue(prev => {
                    let q = prev.map(c => {
                      const upd = updates.find(u => u.id === c.id);
                      return upd ? { ...c, front_content: upd.front_content, back_content: upd.back_content } : c;
                    });
                    if (deletedIds.length > 0) {
                      q = q.filter(c => !deletedIds.includes(c.id));
                    }
                    return q;
                  });
                }}
                onOpenChat={() => setChatOpen(true)}
                chatHasMessages={chatHasMessages}
              />
            }
          />
        </div>
      </main>
      <Suspense fallback={null}>
        <ProModelConfirmDialog open={pendingPro} onConfirm={confirmPro} onCancel={cancelPro} baseCost={BASE_TUTOR_COST} />
        <StudyChatModal
          open={chatOpen}
          onOpenChange={setChatOpen}
          cardContext={currentCard ? { front: currentCard.front_content, back: currentCard.back_content } : undefined}
          streamingResponse={explainInChat ? activeStreamingResponse : undefined}
          isStreamingResponse={explainInChat ? isTutorLoading : false}
          onClearStreaming={() => setExplainInChat(false)}
          resetKey={cardKey}
          onHasMessagesChange={setChatHasMessages}
          clearRef={chatClearRef}
        />
      </Suspense>
    </div>
  );
};

export default Study;