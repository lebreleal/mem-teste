import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudySession } from '@/hooks/useStudySession';
import { useEnergy } from '@/hooks/useEnergy';
import { getNextReadyIndex } from '@/lib/studyUtils';
import { useAIModel } from '@/hooks/useAIModel';
import { invalidateStudyQueries } from '@/lib/queryKeys';
import AIModelSelector from '@/components/AIModelSelector';
import FlashCard from '@/components/FlashCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Brain, Moon, Sun, Timer } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import StudyCardActions from '@/components/StudyCardActions';
import { invokeTutor } from '@/services/aiService';
import { useToast } from '@/hooks/use-toast';
import type { Rating } from '@/lib/fsrs';

const ProModelConfirmDialog = lazy(() => import('@/components/ProModelConfirmDialog'));

const FAST_THRESHOLD_MS = 3000;
const BASE_TUTOR_COST = 2;

const Study = () => {
  const { deckId, folderId } = useParams<{ deckId?: string; folderId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { queue, isLoading, submitReview, algorithmMode } = useStudySession(deckId ?? '', folderId);
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

  const cardShownAt = useRef<number>(Date.now());
  const fastWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tutorResponse, setTutorResponse] = useState<string | null>(null);
  const [isTutorLoading, setIsTutorLoading] = useState(false);

  // Initialize local queue from fetched data (once)
  useEffect(() => {
    if (queue.length > 0 && !queueInitialized) {
      setLocalQueue([...queue]);
      setQueueInitialized(true);
    }
  }, [queue, queueInitialized]);

  // getNextReadyIndex imported from studyUtils

  // Determine current card considering learning step timing
  const readyIndex = useMemo(() => getNextReadyIndex(localQueue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localQueue, waitingSeconds, learningTick]);
  const currentCard = readyIndex >= 0 ? localQueue[readyIndex] : null;

  // Force re-render when the soonest learning card's timer expires
  useEffect(() => {
    const now = Date.now();
    const futureTimes = localQueue
      .filter(c => c.state === 1)
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

    const interval = setInterval(() => {
      const r = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
      setWaitingSeconds(r);
      if (r <= 0) { clearInterval(interval); setCardKey(prev => prev + 1); }
    }, 1000);
    return () => clearInterval(interval);
  }, [allWaiting, localQueue]);

  const totalCards = localQueue.length + reviewCount;
  const progressPercent = totalCards > 0 ? (reviewCount / totalCards) * 100 : 0;

  useEffect(() => {
    cardShownAt.current = Date.now();
    setTutorResponse(null);
  }, [cardKey]);

  useEffect(() => {
    return () => {
      if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current);
    };
  }, []);

  const handleTutorRequest = useCallback(async (options?: { action?: string; mcOptions?: string[]; correctIndex?: number; selectedIndex?: number }) => {
    if (!currentCard || energy < TUTOR_COST) return;
    setIsTutorLoading(true);
    try {
      const result = await invokeTutor({
        frontContent: currentCard.front_content,
        backContent: currentCard.back_content,
        action: options?.action,
        mcOptions: options?.mcOptions,
        correctIndex: options?.correctIndex,
        selectedIndex: options?.selectedIndex,
        aiModel: model,
        energyCost: TUTOR_COST,
      });
      setTutorResponse(result.hint);
      queryClient.invalidateQueries({ queryKey: ['energy'] });
    } catch {
      toast({ title: 'Erro ao consultar o Tutor', variant: 'destructive' });
    } finally {
      setIsTutorLoading(false);
    }
  }, [currentCard, energy, toast, model, TUTOR_COST, queryClient]);

  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleRate = useCallback((rating: Rating) => {
    if (!currentCard || isTransitioning) return;
    const elapsed = Date.now() - cardShownAt.current;

    if (elapsed < FAST_THRESHOLD_MS) {
      if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current);
      fastWarningTimer.current = setTimeout(() => {}, 3000);
    }

    if (rating > 2) {
      addSuccessfulCard.mutate(
        { flowMultiplier: 1.0 },
        {
          onSuccess: (result) => {
            if (result.milestone === 50) toast({ title: '🎉 Bônus de 50 cards!', description: '+5 Créditos IA extra!' });
            else if (result.milestone === 100) toast({ title: '🏆 Bônus de 100 cards!', description: '+10 Créditos IA extra!' });
          },
        }
      );
    }

    setIsTransitioning(true);

    submitReview.mutate(
      { card: currentCard, rating },
      {
        onSuccess: (result) => {
          setTimeout(() => {
            setReviewCount(prev => prev + 1);
            if (rating > 2) {
              // Success: remove card from queue
              setLocalQueue(prev => prev.filter(c => c.id !== currentCard.id));
            } else {
              // Fail: update card with new scheduled_date/state and move to end
              setLocalQueue(prev => {
                const idx = prev.findIndex(c => c.id === currentCard.id);
                if (idx < 0) return prev;
                const updatedCard = {
                  ...prev[idx],
                  state: result.state,
                  stability: result.stability,
                  difficulty: result.difficulty,
                  scheduled_date: result.scheduled_date,
                };
                const without = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
                return [...without, updatedCard];
              });
            }
            setCardKey(prev => prev + 1);
            setIsTransitioning(false);
          }, 150);
        },
        onError: () => {
          setIsTransitioning(false);
        },
      }
    );
  }, [currentCard, isTransitioning, submitReview, addSuccessfulCard, toast]);

  if (isLoading) {
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
          <div className="flex items-center gap-1 rounded-xl px-2 py-1" style={{ background: 'hsl(var(--energy-purple) / 0.1)' }}>
            <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple))' }} />
            <span className="text-xs font-bold text-foreground tabular-nums">{energy}</span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-pomodoro'))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Pomodoro"
          >
            <Timer className="h-3.5 w-3.5" />
          </button>
          <AIModelSelector model={model} onChange={setModel} baseCost={BASE_TUTOR_COST} compact />
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{reviewCount + 1}/{totalCards}</span>
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

      <main className="flex flex-1 min-h-0 items-center justify-center px-2 sm:px-4 py-2 sm:py-4 overflow-y-auto">
        <div key={cardKey} className="w-full animate-fade-in">
          <FlashCard
            frontContent={currentCard.front_content}
            backContent={currentCard.back_content}
            stability={currentCard.stability}
            difficulty={currentCard.difficulty}
            state={currentCard.state}
            scheduledDate={currentCard.scheduled_date}
            cardType={currentCard.card_type}
            onRate={handleRate}
            isSubmitting={submitReview.isPending || isTransitioning}
            quickReview={algorithmMode === 'quick_review'}
            algorithmMode={algorithmMode}
            energy={energy}
            onTutorRequest={handleTutorRequest}
            isTutorLoading={isTutorLoading}
            tutorResponse={tutorResponse}
            actions={
              <StudyCardActions
                card={currentCard}
                onCardUpdated={(updatedFields) => {
                  setLocalQueue(prev => prev.map(c => c.id === currentCard.id ? { ...c, ...updatedFields } : c));
                  setCardKey(prev => prev + 1);
                }}
                onCardFrozen={() => { setLocalQueue(prev => prev.filter(c => c.id !== currentCard.id)); setCardKey(prev => prev + 1); }}
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
              />
            }
          />
        </div>
      </main>
      <Suspense fallback={null}>
        <ProModelConfirmDialog open={pendingPro} onConfirm={confirmPro} onCancel={cancelPro} baseCost={BASE_TUTOR_COST} />
      </Suspense>
    </div>
  );
};

export default Study;