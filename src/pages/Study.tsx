import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudySession } from '@/hooks/useStudySession';
import { useEnergy } from '@/hooks/useEnergy';
import { getNextReadyIndex, parseStepToMinutes } from '@/lib/studyUtils';
import { useAIModel } from '@/hooks/useAIModel';
import { invalidateStudyQueries } from '@/lib/queryKeys';
import { useTutorStream } from '@/hooks/useTutorStream';
import { useStudyUndo } from '@/hooks/useStudyUndo';
import AIModelSelector from '@/components/AIModelSelector';
import FlashCard from '@/components/FlashCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Brain, Moon, Sun, Timer, RefreshCw, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useTheme } from '@/hooks/useTheme';
import StudyCardActions from '@/components/StudyCardActions';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
    invalidateStudyQueries(queryClient);
    if (deckId) navigate(`/decks/${deckId}`, { replace: true });
    else if (folderId) navigate(`/dashboard?folder=${folderId}`, { replace: true });
    else navigate('/dashboard', { replace: true });
  }, [deckId, folderId, navigate, queryClient]);
  const TUTOR_COST = getCost(BASE_TUTOR_COST);

  

  // Local queue state
  const [localQueue, setLocalQueue] = useState<any[]>([]);
  const [queueInitialized, setQueueInitialized] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [cardKey, setCardKey] = useState(0);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [learningTick, setLearningTick] = useState(0);
  const [initialQueueSize, setInitialQueueSize] = useState(0);
  const reviewedCardIdsRef = useRef(new Set<string>());
  const cardShownAt = useRef<number>(Date.now());
  const fastWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainScrollRef = useRef<HTMLElement>(null);

  // Reset scroll on card change
  useEffect(() => { mainScrollRef.current && (mainScrollRef.current.scrollTop = 0); }, [cardKey]);

  // Extracted hooks
  const tutor = useTutorStream(energy, model, TUTOR_COST, cardKey);
  const undo = useStudyUndo(setLocalQueue, setReviewCount, setCardKey, reviewedCardIdsRef);

  const [chatOpen, setChatOpen] = useState(false);
  const [explainInChat, setExplainInChat] = useState<string | false>(false);
  const [chatHasMessages, setChatHasMessages] = useState(false);
  const chatClearRef = useRef<(() => void) | null>(null);

  // Initialize local queue from fetched data (once)
  useEffect(() => {
    if (queue.length > 0 && !queueInitialized) {
      setLocalQueue([...queue]);
      setInitialQueueSize(queue.length);
      setQueueInitialized(true);
    }
  }, [queue, queueInitialized]);

  // Clear stale cache on unmount
  const studyQueueKey = useMemo(
    () => ['study-queue', folderId ? `folder-${folderId}` : deckId],
    [deckId, folderId],
  );
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: studyQueueKey });
      queryClient.invalidateQueries({ queryKey: ['study-stats'] });
      queryClient.invalidateQueries({ queryKey: ['activity-full'] });
    };
  }, [queryClient, studyQueueKey]);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const readyIndex = useMemo(() => getNextReadyIndex(localQueue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localQueue, waitingSeconds, learningTick]);
  const nextCard = readyIndex >= 0 ? localQueue[readyIndex] : null;

  const [displayedCard, setDisplayedCard] = useState<any>(null);
  useEffect(() => {
    if (!isTransitioning) setDisplayedCard(nextCard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, isTransitioning, queueInitialized]);
  const currentCard = displayedCard ?? nextCard;

  // Fetch community deck source info via RPC (SECURITY DEFINER bypasses RLS)
  const currentCardDeckId = currentCard?.deck_id ?? deckId ?? null;
  const { data: sourceInfo } = useQuery({
    queryKey: ['study-source-info', currentCardDeckId],
    queryFn: async () => {
      const { data } = await supabase.rpc('resolve_community_deck_source', { p_deck_id: currentCardDeckId! });
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      const obj = data as Record<string, unknown>;
      return { authorName: (obj.authorName as string) ?? null, updatedAt: (obj.updatedAt as string) ?? null };
    },
    enabled: !!currentCardDeckId,
    staleTime: 5 * 60_000,
  });

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

  // Countdown timer
  useEffect(() => {
    if (!allWaiting) { setWaitingSeconds(0); return; }
    const now = Date.now();
    const soonest = Math.min(...localQueue.map(c => new Date(c.scheduled_date).getTime()));
    const remaining = Math.max(0, Math.ceil((soonest - now) / 1000));
    setWaitingSeconds(remaining);
    if (remaining <= 0) { setLearningTick(prev => prev + 1); return; }
    const interval = setInterval(() => {
      const r = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
      setWaitingSeconds(r);
      if (r <= 0) { clearInterval(interval); setLearningTick(prev => prev + 1); }
    }, 1000);
    return () => clearInterval(interval);
  }, [allWaiting, localQueue]);

  const cardsCompleted = initialQueueSize - localQueue.length;
  const progressPercent = initialQueueSize > 0 ? Math.min(100, (cardsCompleted / initialQueueSize) * 100) : 0;

  // Open chat when streaming content arrives
  const activeStreamingResponse = explainInChat === 'explain-mc' ? tutor.mcExplainResponse : explainInChat === 'explain' ? tutor.explainResponse : null;
  useEffect(() => {
    if (explainInChat && activeStreamingResponse && !chatOpen) setChatOpen(true);
  }, [explainInChat, activeStreamingResponse, chatOpen]);

  useEffect(() => {
    return () => { if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current); };
  }, []);

  const submittingRef = useRef<string | null>(null);

  const handleRate = useCallback((rating: Rating) => {
    if (!currentCard || isTransitioning) return;
    if (submittingRef.current === currentCard.id) return;
    submittingRef.current = currentCard.id;

    undo.saveSnapshot({
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
    tutor.abortTutor();
    const elapsed = Date.now() - cardShownAt.current;

    if (elapsed < FAST_THRESHOLD_MS) {
      if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current);
      fastWarningTimer.current = setTimeout(() => {}, 3000);
    }

    if (rating > 2) addSuccessfulCard.mutate({ flowMultiplier: 1.0 });

    const shouldKeep = rating === 1 || (rating === 2 && currentCard.state !== 2);
    reviewedCardIdsRef.current.add(currentCard.id);
    setReviewCount(prev => prev + 1);

    if (shouldKeep) {
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
        const updatedCard = { ...prev[idx], state: estimatedState, scheduled_date: estimatedDate, learning_step: stepIdx };
        const without = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        return [...without, updatedCard];
      });
    } else {
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

    setIsTransitioning(true);
    setTimeout(() => {
      setCardKey(prev => prev + 1);
      cardShownAt.current = Date.now();
      submittingRef.current = null;
      setIsTransitioning(false);
    }, 200);

    submitReview.mutate(
      { card: currentCard, rating, elapsedMs: elapsed },
      {
        onSuccess: (result) => {
          if (shouldKeep && result.interval_days === 0) {
            setLocalQueue(prev => prev.map(c =>
              c.id === currentCard.id
                ? { ...c, state: result.state, stability: result.stability, difficulty: result.difficulty, scheduled_date: result.scheduled_date, learning_step: result.learning_step ?? 0 }
                : c
            ));
          }
        },
      }
    );
  }, [currentCard, isTransitioning, submitReview, addSuccessfulCard, localQueue, reviewCount, cardKey, deckConfig, undo, tutor]);

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
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-8 w-8 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button onClick={toggleTheme} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Alternar tema">
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-pomodoro'))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Pomodoro">
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

      <div className="h-1.5 w-full bg-muted/40">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%`, background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`, borderRadius: '0 4px 4px 0' }}
        />
      </div>

      <main ref={mainScrollRef} className="flex flex-1 min-h-0 items-center justify-center px-2 sm:px-4 py-2 sm:py-4 overflow-y-auto">
        <div key={cardKey} className={`w-full transition-all duration-200 ${isTransitioning ? 'opacity-0 scale-95' : 'animate-fade-in'}`}>
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
            onTutorRequest={(options) => tutor.handleTutorRequest(currentCard, options)}
            isTutorLoading={tutor.isTutorLoading}
            hintResponse={tutor.hintResponse}
            explainResponse={tutor.explainResponse}
            mcExplainResponse={tutor.mcExplainResponse}
            canUndo={undo.canUndo}
            onUndo={undo.handleUndo}
            onOpenExplainChat={(options) => {
              const action = options?.action || 'explain';
              setExplainInChat(action);
              chatClearRef.current?.();
              tutor.handleTutorRequest(currentCard, options || { action: 'explain' });
            }}
            actions={
              <>
                <StudyCardActions
                  card={currentCard}
                  isLiveDeck={isLiveDeck}
                  onCardUpdated={(updatedFields) => {
                    setLocalQueue(prev => prev.map(c => c.id === currentCard.id ? { ...c, ...updatedFields } : c));
                    setDisplayedCard(prev => prev && prev.id === currentCard.id ? { ...prev, ...updatedFields } : prev);
                  }}
                  onCardFrozen={() => { setLocalQueue(prev => prev.filter(c => c.id !== currentCard.id)); setCardKey(prev => prev + 1); }}
                  onCardBuried={() => {
                    setLocalQueue(prev => {
                      let filtered = prev.filter(c => c.id !== currentCard.id);
                      if (currentCard.card_type === 'cloze') {
                        const sibIds = getSiblingIds(currentCard, filtered);
                        if (sibIds.length > 0) {
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
                      if (deletedIds.length > 0) q = q.filter(c => !deletedIds.includes(c.id));
                      return q;
                    });
                  }}
                  onOpenChat={() => setChatOpen(true)}
                  chatHasMessages={chatHasMessages}
                />
                {sourceInfo && (
                  <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground mt-2 w-full">
                    {sourceInfo.authorName && (
                      <span>por <span className="font-medium text-foreground">{sourceInfo.authorName}</span></span>
                    )}
                    {sourceInfo.updatedAt && (
                      <span className="flex items-center gap-0.5">
                        <RefreshCw className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(sourceInfo.updatedAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                  </div>
                )}
              </>
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
          isStreamingResponse={explainInChat ? tutor.isTutorLoading : false}
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
