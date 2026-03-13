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
import { useAuth } from '@/hooks/useAuth';
import AIModelSelector from '@/components/AIModelSelector';
import FlashCard from '@/components/FlashCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Brain, Moon, Sun, Timer, RefreshCw, Info, AlertTriangle, ChevronRight } from 'lucide-react';
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
import { getCardConcepts, getConceptRelatedCards, generateReinforcementCards, updateConceptMastery, type GlobalConcept } from '@/services/globalConceptService';

const ProModelConfirmDialog = lazy(() => import('@/components/ProModelConfirmDialog'));
const StudyChatModal = lazy(() => import('@/components/StudyChatModal'));

const FAST_THRESHOLD_MS = 3000;
const BASE_TUTOR_COST = 2;
const LEECH_THRESHOLD = 3;

/** Get IDs of cloze siblings (same front_content, different card) from queue */
function getSiblingIds(card: any, queue: any[]): string[] {
  if (card.card_type !== 'cloze') return [];
  return queue
    .filter(c => c.id !== card.id && c.card_type === 'cloze' && c.front_content === card.front_content)
    .map(c => c.id);
}

/**
 * Key used for leech fail counting.
 * For cloze siblings, count by shared front so repeated misses aggregate naturally.
 */
function getLeechKey(card: { id: string; card_type: string; front_content: string }): string {
  if (card.card_type === 'cloze') {
    return `cloze:${card.front_content ?? ''}`;
  }
  return `card:${card.id}`;
}

type LeechInterruptionState = {
  cardId: string;
  leechKey: string;
  failCount: number;
  interruptedAt: string;
};

const Study = () => {
  const { deckId, folderId } = useParams<{ deckId?: string; folderId?: string }>();
  const isUnifiedMode = !deckId && !folderId; // /study/all route
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { queue, isLoading, isFetching, submitReview, algorithmMode, isLiveDeck, deckConfig, deckConfigs } = useStudySession(isUnifiedMode ? '__all__' : (deckId ?? ''), folderId);
  const { theme, toggleTheme } = useTheme();
  const { energy, addSuccessfulCard } = useEnergy();
  const { model, setModel, getCost, pendingPro, confirmPro, cancelPro } = useAIModel();
  const goBack = useCallback(() => {
    invalidateStudyQueries(queryClient);
    if (isUnifiedMode) navigate('/dashboard', { replace: true });
    else if (deckId) navigate(`/decks/${deckId}`, { replace: true });
    else if (folderId) navigate(`/dashboard?folder=${folderId}`, { replace: true });
    else navigate('/dashboard', { replace: true });
  }, [deckId, folderId, isUnifiedMode, navigate, queryClient]);
  const TUTOR_COST = getCost(BASE_TUTOR_COST);

  /** Resolve deck config for a specific card (unified mode uses per-card lookup) */
  const getCardDeckConfig = useCallback((card: any) => {
    if (isUnifiedMode && card?.deck_id && deckConfigs[card.deck_id]) {
      return deckConfigs[card.deck_id];
    }
    return deckConfig ?? {};
  }, [isUnifiedMode, deckConfigs, deckConfig]);


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

  // Leech trigger state
  const failCountRef = useRef<Map<string, number>>(new Map());
  const leechBypassOnceRef = useRef<Set<string>>(new Set());
  const leechAdvanceLockRef = useRef(false);
  const leechFailStorageKey = useMemo(
    () => `study-leech-fails:${isUnifiedMode ? 'unified' : (folderId ? `folder-${folderId}` : deckId ?? 'no-deck')}`,
    [deckId, folderId, isUnifiedMode],
  );
  const leechInterruptionStorageKey = useMemo(
    () => `study-leech-interruption:${isUnifiedMode ? 'unified' : (folderId ? `folder-${folderId}` : deckId ?? 'no-deck')}`,
    [deckId, folderId],
  );

  const readLeechFailCounts = useCallback(() => {
    if (typeof window === 'undefined') return new Map<string, number>();
    const parseEntries = (raw: string | null) => {
      if (!raw) return null;
      try {
        const entries = JSON.parse(raw) as unknown;
        if (!Array.isArray(entries)) return null;
        return new Map(
          entries.filter(
            (entry): entry is [string, number] =>
              Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number',
          ),
        );
      } catch {
        return null;
      }
    };

    const sessionMap = parseEntries(window.sessionStorage.getItem(leechFailStorageKey));
    if (sessionMap) return sessionMap;

    const localMap = parseEntries(window.localStorage.getItem(leechFailStorageKey));
    if (localMap) return localMap;

    return new Map<string, number>();
  }, [leechFailStorageKey]);

  const readLeechInterruption = useCallback((): LeechInterruptionState | null => {
    if (typeof window === 'undefined') return null;
    const parseValue = (raw: string | null) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<LeechInterruptionState>;
        if (
          typeof parsed?.cardId === 'string'
          && typeof parsed?.leechKey === 'string'
          && typeof parsed?.failCount === 'number'
          && typeof parsed?.interruptedAt === 'string'
        ) {
          return parsed as LeechInterruptionState;
        }
      } catch {
        return null;
      }
      return null;
    };

    const sessionValue = parseValue(window.sessionStorage.getItem(leechInterruptionStorageKey));
    if (sessionValue) return sessionValue;

    const localValue = parseValue(window.localStorage.getItem(leechInterruptionStorageKey));
    if (localValue) return localValue;

    return null;
  }, [leechInterruptionStorageKey]);

  const persistLeechFailCounts = useCallback(() => {
    if (typeof window === 'undefined') return;

    const write = (storage: Storage, value: string | null) => {
      try {
        if (value === null) storage.removeItem(leechFailStorageKey);
        else storage.setItem(leechFailStorageKey, value);
      } catch {
        // no-op: storage can be unavailable in some browser contexts
      }
    };

    const entries = Array.from(failCountRef.current.entries());
    if (entries.length === 0) {
      write(window.sessionStorage, null);
      write(window.localStorage, null);
      return;
    }

    const serialized = JSON.stringify(entries);
    write(window.sessionStorage, serialized);
    write(window.localStorage, serialized);
  }, [leechFailStorageKey]);

  const persistLeechInterruption = useCallback((value: LeechInterruptionState | null) => {
    if (typeof window === 'undefined') return;

    const write = (storage: Storage) => {
      try {
        if (!value) {
          storage.removeItem(leechInterruptionStorageKey);
          return;
        }
        storage.setItem(leechInterruptionStorageKey, JSON.stringify(value));
      } catch {
        // no-op: storage can be unavailable in some browser contexts
      }
    };

    write(window.sessionStorage);
    write(window.localStorage);
  }, [leechInterruptionStorageKey]);

  const [leechMode, setLeechMode] = useState<{
    leechCard: any;
    concept: GlobalConcept | null;
    reinforceCards: { id: string; front_content: string; back_content: string; deck_id: string }[];
    retryCards: { id: string; front_content: string; back_content: string; deck_id: string }[];
    currentIndex: number;
    round: number;
    flipped: boolean;
    loading?: boolean;
    isAdvancing?: boolean;
    feedback?: 'correct' | null;
    correctCount?: number;
    wrongCount?: number;
  } | null>(null);
  const [leechInterruption, setLeechInterruption] = useState<LeechInterruptionState | null>(null);
  const [leechSkipConfirmOpen, setLeechSkipConfirmOpen] = useState(false);

  // Reset scroll on card change
  useEffect(() => { mainScrollRef.current && (mainScrollRef.current.scrollTop = 0); }, [cardKey]);

  // Extracted hooks
  const tutor = useTutorStream(energy, model, TUTOR_COST, cardKey);
  const undo = useStudyUndo(setLocalQueue, setReviewCount, setCardKey, reviewedCardIdsRef);

  const [chatOpen, setChatOpen] = useState(false);
  const [explainInChat, setExplainInChat] = useState<string | false>(false);
  const [chatHasMessages, setChatHasMessages] = useState(false);
  const chatClearRef = useRef<(() => void) | null>(null);
  const [communityInfoOpen, setCommunityInfoOpen] = useState(false);

  // Initialize local queue from fetched data (once)
  useEffect(() => {
    if (queue.length > 0 && !queueInitialized) {
      setLocalQueue([...queue]);
      setInitialQueueSize(queue.length);
      setQueueInitialized(true);
    }
  }, [queue, queueInitialized]);

  // Restore leech fail counters for this study context
  useEffect(() => {
    failCountRef.current = readLeechFailCounts();
  }, [readLeechFailCounts]);

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

  // Fallback hydration: if in-memory/storage count is missing, recover streak from recent review logs.
  // This prevents losing leech progress after navigation/reload.
  useEffect(() => {
    if (!currentCard || !user || leechMode) return;

    const leechKey = getLeechKey(currentCard);
    if ((failCountRef.current.get(leechKey) ?? 0) > 0) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('review_logs')
        .select('rating')
        .eq('user_id', user.id)
        .eq('card_id', currentCard.id)
        .order('reviewed_at', { ascending: false })
        .limit(LEECH_THRESHOLD - 1);

      if (cancelled || error || !data?.length) return;

      let streak = 0;
      for (const row of data) {
        if (row.rating === 1) streak += 1;
        else break;
      }

      if (streak > 0) {
        failCountRef.current.set(leechKey, streak);
        persistLeechFailCounts();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentCard, user, leechMode, persistLeechFailCounts]);

  // Restore interruption modal when user closes/reopens app mid-leech flow
  useEffect(() => {
    if (leechMode || leechInterruption) return;
    const saved = readLeechInterruption();
    if (!saved) return;

    // The interruption is valid — show modal regardless of current card
    // (the review was already submitted, this is just the modal prompt)
    setLeechInterruption(saved);
  }, [leechMode, leechInterruption, readLeechInterruption]);

  const clearLeechInterruption = useCallback(() => {
    setLeechInterruption(null);
    setLeechSkipConfirmOpen(false);
    persistLeechInterruption(null);
  }, [persistLeechInterruption]);

  const startLeechModeForCard = useCallback(async (card: any) => {
    if (!user) return;

    leechAdvanceLockRef.current = false;

    setLeechMode({
      leechCard: card,
      concept: null,
      reinforceCards: [],
      retryCards: [],
      currentIndex: 0,
      round: 1,
      flipped: false,
      loading: true,
      isAdvancing: false,
      feedback: null,
      correctCount: 0,
      wrongCount: 0,
    });

    try {
      const concepts = await getCardConcepts(card.id, user.id);
      const weakest = concepts.length > 0 ? concepts[0] : null;
      let reinforceCards: any[] = [];

      if (weakest) {
        reinforceCards = await getConceptRelatedCards(weakest.id, user.id);
        reinforceCards = reinforceCards.filter(c => c.id !== card.id).slice(0, 10);
      }

      if (reinforceCards.length === 0) {
        const conceptName = weakest?.name ?? `${card.front_content}`.replace(/<[^>]*>/g, '').slice(0, 100);
        reinforceCards = await generateReinforcementCards(conceptName, user.id, {
          front_content: card.front_content,
          back_content: card.back_content,
        });
        reinforceCards = reinforceCards.filter(c => c.id !== card.id).slice(0, 10);
      }

      setLeechMode({
        leechCard: card,
        concept: weakest,
        reinforceCards,
        retryCards: [],
        currentIndex: 0,
        round: 1,
        flipped: false,
        loading: false,
        isAdvancing: false,
        feedback: null,
        correctCount: 0,
        wrongCount: 0,
      });
    } catch {
      setLeechMode(prev => prev ? { ...prev, loading: false } : null);
    }
  }, [user]);

  const submittingRef = useRef<string | null>(null);

  /** Submit the review to backend + update local queue. Extracted so leech path can reuse it. */
  const executeReview = useCallback((card: any, rating: Rating) => {
    undo.saveSnapshot({
      queue: [...localQueue],
      reviewCount,
      cardKey,
      cardId: card.id,
      prevCardState: {
        stability: card.stability,
        difficulty: card.difficulty,
        state: card.state,
        scheduled_date: card.scheduled_date,
        last_reviewed_at: card.last_reviewed_at ?? null,
      },
    });
    tutor.abortTutor();
    const elapsed = Date.now() - cardShownAt.current;

    if (elapsed < FAST_THRESHOLD_MS) {
      if (fastWarningTimer.current) clearTimeout(fastWarningTimer.current);
      fastWarningTimer.current = setTimeout(() => {}, 3000);
    }

    if (rating > 2) addSuccessfulCard.mutate({ flowMultiplier: 1.0 });

    const shouldKeep = rating === 1 || (rating === 2 && card.state !== 2);
    reviewedCardIdsRef.current.add(card.id);
    setReviewCount(prev => prev + 1);

    if (shouldKeep) {
      const cardConfig = getCardDeckConfig(card);
      const steps = cardConfig?.learning_steps ?? ['1', '10'];
      const currentStep = card.learning_step ?? 0;
      const stepIdx = rating === 1 ? 0 : Math.min(currentStep + 1, steps.length - 1);
      const stepStr = steps[stepIdx] ?? '1';
      const stepMinutes = parseStepToMinutes(stepStr);
      const estimatedDate = new Date(Date.now() + stepMinutes * 60 * 1000).toISOString();
      const estimatedState = rating === 1 && card.state === 2 ? 3 : (card.state === 0 ? 1 : card.state);

      setLocalQueue(prev => {
        const idx = prev.findIndex(c => c.id === card.id);
        if (idx < 0) return prev;
        const updatedCard = { ...prev[idx], state: estimatedState, scheduled_date: estimatedDate, learning_step: stepIdx };
        const without = [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        return [...without, updatedCard];
      });
    } else {
      const buriedSiblingIds: string[] = [];
      setLocalQueue(prev => {
        let filtered = prev.filter(c => c.id !== card.id);
        if (card.card_type === 'cloze') {
          const cardCfg = getCardDeckConfig(card);
          const buryNew = cardCfg?.bury_new_siblings !== false;
          const buryReview = cardCfg?.bury_review_siblings !== false;
          const buryLearning = cardCfg?.bury_learning_siblings !== false;
          if (buryNew || buryReview || buryLearning) {
            const siblingIds = getSiblingIds(card, filtered);
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
      { card, rating, elapsedMs: elapsed },
      {
        onSuccess: (result) => {
          if (shouldKeep && result.interval_days === 0) {
            setLocalQueue(prev => prev.map(c =>
              c.id === card.id
                ? { ...c, state: result.state, stability: result.stability, difficulty: result.difficulty, scheduled_date: result.scheduled_date, learning_step: result.learning_step ?? 0 }
                : c
            ));
          }

          // ── Fase 1a: Sync card review → concept mastery (non-blocking) ──
          if (user) {
            const isCorrect = rating >= 3;
            getCardConcepts(card.id, user.id)
              .then(concepts => {
                for (const concept of concepts) {
                  updateConceptMastery(concept.id, isCorrect).catch(() => {});
                }
              })
              .catch(() => {});
          }
        },
      }
    );
  }, [localQueue, reviewCount, cardKey, deckConfig, deckConfigs, getCardDeckConfig, undo, tutor, addSuccessfulCard, submitReview, user]);

  const handleRate = useCallback(async (rating: Rating) => {
    if (!currentCard || isTransitioning || leechMode) return;
    if (submittingRef.current === currentCard.id) return;
    submittingRef.current = currentCard.id;

    // Leech detection: track consecutive fails per card/group
    const leechKey = getLeechKey(currentCard);
    const bypassLeechInterruption = leechBypassOnceRef.current.has(leechKey);
    if (bypassLeechInterruption) {
      leechBypassOnceRef.current.delete(leechKey);
    }

    if (rating === 1) {
      let previousFails = failCountRef.current.get(leechKey) ?? 0;

      // Extra fallback for resumed sessions: recover previous streak from DB if local count was lost.
      if (previousFails === 0 && user) {
        try {
          const { data } = await supabase
            .from('review_logs')
            .select('rating')
            .eq('user_id', user.id)
            .eq('card_id', currentCard.id)
            .order('reviewed_at', { ascending: false })
            .limit(LEECH_THRESHOLD - 1);

          let recoveredStreak = 0;
          for (const row of data ?? []) {
            if (row.rating === 1) recoveredStreak += 1;
            else break;
          }

          if (recoveredStreak > 0) {
            previousFails = recoveredStreak;
            failCountRef.current.set(leechKey, recoveredStreak);
          }
        } catch {
          // DB recovery failed, continue with local count
        }
      }

      const count = previousFails + 1;
      failCountRef.current.set(leechKey, count);
      persistLeechFailCounts();

      if (count >= LEECH_THRESHOLD && user && !bypassLeechInterruption) {
        // IMPORTANT: Submit the review BEFORE pausing — so the "Again" is recorded
        executeReview(currentCard, rating);

        const interruption: LeechInterruptionState = {
          cardId: currentCard.id,
          leechKey,
          failCount: count,
          interruptedAt: new Date().toISOString(),
        };

        // Small delay to let the transition finish before showing modal
        setTimeout(() => {
          setLeechInterruption(interruption);
          setLeechSkipConfirmOpen(false);
          persistLeechInterruption(interruption);
        }, 300);
        return;
      }
    } else {
      // Reset fail count on non-Again rating
      failCountRef.current.delete(leechKey);
      persistLeechFailCounts();
    }

    executeReview(currentCard, rating);
  }, [currentCard, isTransitioning, leechMode, user, persistLeechFailCounts, persistLeechInterruption, executeReview]);

  // ─── Leech Mode: Mini Reinforcement Session ───
  const exitLeechMode = useCallback(() => {
    if (!leechMode) return;
    // Reset fail count for the leech card/group and put it back with learning_step 0
    failCountRef.current.delete(getLeechKey(leechMode.leechCard));
    persistLeechFailCounts();
    setLocalQueue(prev => prev.map(c =>
      c.id === leechMode.leechCard.id ? { ...c, learning_step: 0 } : c,
    ));
    leechAdvanceLockRef.current = false;
    setLeechMode(null);
    setCardKey(prev => prev + 1);
    cardShownAt.current = Date.now();
  }, [leechMode, persistLeechFailCounts]);

  if (leechMode) {
    const {
      concept,
      reinforceCards,
      currentIndex,
      round,
      flipped,
      leechCard,
      loading,
      feedback,
      isAdvancing = false,
      correctCount = 0,
      wrongCount = 0,
      retryCards,
    } = leechMode;

    const hasCards = reinforceCards.length > 0;
    const currentReinforceCard = hasCards ? reinforceCards[currentIndex] : null;
    const totalCards = reinforceCards.length;
    const isRetryRound = round > 1;

    const advanceCard = (wasCorrect: boolean) => {
      if (!currentReinforceCard || isAdvancing || leechAdvanceLockRef.current) return;

      leechAdvanceLockRef.current = true;
      const isLastCardInRound = currentIndex >= totalCards - 1;
      const shouldExitAfterThisAnswer = wasCorrect && isLastCardInRound && retryCards.length === 0;

      setLeechMode(prev => prev ? {
        ...prev,
        isAdvancing: true,
        feedback: wasCorrect ? 'correct' : null,
        correctCount: (prev.correctCount ?? 0) + (wasCorrect ? 1 : 0),
        wrongCount: (prev.wrongCount ?? 0) + (wasCorrect ? 0 : 1),
      } : null);

      const delayMs = wasCorrect ? 650 : 120;

      setTimeout(() => {
        if (shouldExitAfterThisAnswer) {
          exitLeechMode();
          return;
        }

        setLeechMode(prev => {
          if (!prev) return null;

          const activeCard = prev.reinforceCards[prev.currentIndex];
          const nextRetryCards = !wasCorrect && activeCard
            ? (prev.retryCards.some(card => card.id === activeCard.id)
              ? prev.retryCards
              : [...prev.retryCards, activeCard])
            : prev.retryCards;
          const atEndOfRound = prev.currentIndex >= prev.reinforceCards.length - 1;

          if (!atEndOfRound) {
            return {
              ...prev,
              retryCards: nextRetryCards,
              currentIndex: prev.currentIndex + 1,
              flipped: false,
              feedback: null,
              isAdvancing: false,
            };
          }

          return {
            ...prev,
            reinforceCards: nextRetryCards,
            retryCards: [],
            currentIndex: 0,
            round: (prev.round ?? 1) + 1,
            flipped: false,
            feedback: null,
            isAdvancing: false,
          };
        });

        leechAdvanceLockRef.current = false;
      }, delayMs);
    };

    return (
      <div className="flex h-[100dvh] flex-col bg-background overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-background flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-primary/20">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary">Reforço de Base</p>
              {concept && <p className="text-[10px] text-muted-foreground">{concept.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasCards && totalCards > 0 && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-primary font-bold">{correctCount}✓</span>
                <span className="text-destructive font-bold">{wrongCount}✗</span>
              </div>
            )}
            {hasCards && (
              <span className="text-xs font-bold text-muted-foreground tabular-nums">
                {currentIndex + 1}/{totalCards}
              </span>
            )}
          </div>
        </header>

        {/* Progress bar */}
        {hasCards && totalCards > 0 && (
          <div className="h-1 w-full bg-muted/40">
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${((currentIndex + (isAdvancing ? 1 : 0)) / totalCards) * 100}%`,
                background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`,
                borderRadius: '0 4px 4px 0',
              }}
            />
          </div>
        )}

        <main className="flex flex-1 min-h-0 flex-col items-center justify-center px-4 py-6 overflow-y-auto">
          {loading ? (
            <div className="animate-fade-in w-full max-w-lg space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Brain className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Gerando conteúdo de reforço simplificado...</p>
              <p className="text-[10px] text-muted-foreground">Vamos explicar de um jeito mais fácil</p>
            </div>
          ) : (
            <div className="animate-fade-in w-full max-w-lg space-y-5 text-center">
              {/* Intro message — only on first card before flip */}
              {currentIndex === 0 && !flipped && !feedback && !isRetryRound && (
                <div className="space-y-1.5 px-2">
                  <p className="text-sm text-muted-foreground">
                    Você errou este card <span className="font-bold text-destructive">{LEECH_THRESHOLD}×</span>.
                    {hasCards
                      ? <> Vamos revisar o tema com cards mais simples para reforçar a base.</>
                      : <> Revise o conteúdo abaixo antes de continuar.</>
                    }
                  </p>
                </div>
              )}

              {isRetryRound && !feedback && (
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                  Revisando novamente os cards marcados como “Não lembrei”.
                </div>
              )}

              {/* Feedback overlay (somente para acerto) */}
              {feedback === 'correct' && (
                <div className="rounded-xl py-3 px-4 text-sm font-medium transition-all animate-fade-in bg-primary/10 text-primary">
                  ✓ Boa! Você lembrou.
                </div>
              )}

              {/* Reinforcement card */}
              {hasCards && currentReinforceCard && !feedback ? (
                <div
                  className={`cursor-pointer rounded-2xl border-2 bg-card p-6 shadow-sm transition-all hover:shadow-md min-h-[200px] flex items-center justify-center ${
                    flipped ? 'border-primary/30' : 'border-border'
                  }`}
                  onClick={() => !flipped && !isAdvancing && setLeechMode(prev => prev ? { ...prev, flipped: true } : null)}
                >
                  <div className="w-full">
                    {!flipped ? (
                      <div className="space-y-3">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pergunta</p>
                        <div
                          className="text-base text-foreground leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: currentReinforceCard.front_content }}
                        />
                        <p className="text-[10px] text-muted-foreground mt-4 opacity-60">Tente lembrar, depois toque para ver</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[10px] font-medium text-primary uppercase tracking-wider">Resposta</p>
                        <div
                          className="text-base text-foreground leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: currentReinforceCard.back_content }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : !feedback && (
                /* Fallback: show the leech card's back content as study material */
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <p className="text-[10px] font-medium text-primary uppercase tracking-wider mb-3">Revise o conteúdo</p>
                  <div
                    className="text-base text-foreground leading-relaxed text-left"
                    dangerouslySetInnerHTML={{ __html: leechCard.back_content }}
                  />
                </div>
              )}

              {/* Action buttons — only show after flipping */}
              {!feedback && (
                <div className="flex gap-3 justify-center pt-2">
                  {hasCards && flipped ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => advanceCard(false)}
                        disabled={isAdvancing}
                        className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                      >
                        Não lembrei
                      </Button>
                      <Button
                        onClick={() => advanceCard(true)}
                        disabled={isAdvancing}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Lembrei
                      </Button>
                    </>
                  ) : !hasCards ? (
                    <Button onClick={exitLeechMode} className="gap-2">
                      Entendi, voltar à sessão <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

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
            }
            communityMeta={sourceInfo ? (
              <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground mt-1">
                {sourceInfo.authorName && (
                  <span>por <span className="font-medium text-foreground">{sourceInfo.authorName}</span></span>
                )}
                {sourceInfo.updatedAt && (
                  <span className="flex items-center gap-0.5">
                    <RefreshCw className="h-2.5 w-2.5" />
                    {formatDistanceToNow(new Date(sourceInfo.updatedAt), { addSuffix: true, locale: ptBR })}
                  </span>
                )}
                <button
                  onClick={() => setCommunityInfoOpen(true)}
                  className="flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Informações do card de comunidade"
                >
                  <Info className="h-3 w-3" />
                </button>
              </div>
            ) : undefined}
          />
        </div>
      </main>

      <Dialog open={!!leechInterruption} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-base">Sessão pausada para reforço</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Você errou este card <strong className="text-destructive">{leechInterruption?.failCount ?? LEECH_THRESHOLD} vezes</strong> seguidas,
              então pausamos para evitar consolidar o erro.
            </p>
            <p>Se você fechar o app agora, vamos lembrar essa pausa e retomar este aviso quando voltar.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setLeechSkipConfirmOpen(true)}
            >
              Continuar sem reforço
            </Button>
            <Button
              onClick={() => {
                if (!leechInterruption) {
                  clearLeechInterruption();
                  return;
                }
                // Find the card by ID in the queue (it may have moved after the review was submitted)
                const targetCard = localQueue.find(c => c.id === leechInterruption.cardId) ?? currentCard;
                if (!targetCard) {
                  clearLeechInterruption();
                  return;
                }
                clearLeechInterruption();
                void startLeechModeForCard(targetCard);
              }}
            >
              Fazer mini-reforço
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={leechSkipConfirmOpen} onOpenChange={setLeechSkipConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Tem certeza que quer pular?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Pular o reforço pode manter a lacuna de base e aumentar a chance de erro repetido nesse mesmo tema.
            </p>
            <p>Se mesmo assim você quiser, liberamos continuar normalmente agora.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setLeechSkipConfirmOpen(false)}>
              Voltar e revisar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                // Review was already submitted when leech triggered.
                // Just clear the interruption and let the user continue.
                if (leechInterruption) {
                  leechBypassOnceRef.current.add(leechInterruption.leechKey);
                }
                clearLeechInterruption();
              }}
            >
              Continuar mesmo assim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
      <Dialog open={communityInfoOpen} onOpenChange={setCommunityInfoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Card de Comunidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Este cartão pertence a um baralho de comunidade
              {sourceInfo?.authorName && <> criado por <span className="font-medium text-foreground">{sourceInfo.authorName}</span></>}.
            </p>
            <p className="flex items-start gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />
              <span>
                A data de atualização indica quando o <strong className="text-foreground">conteúdo do baralho</strong> foi editado pelo criador — seja uma edição direta ou uma sugestão aceita da comunidade.
              </span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Study;
