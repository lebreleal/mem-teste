import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Play, CalendarCheck, SquarePlus, RotateCcw, Layers, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DeckWithStats } from '@/types/deck';

function formatMinutes(m: number) {
  if (m <= 0) return '0min';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

/** Aggregate stats across a deck and all its descendants */
function getAggregateRaw(deck: DeckWithStats, allDecks: DeckWithStats[]): { new_count: number; learning_count: number; review_count: number; newReviewed: number; newGraduated: number; reviewed: number } {
  const subs = allDecks.filter(d => d.parent_deck_id === deck.id && !d.is_archived);
  let n = deck.new_count, l = deck.learning_count, r = deck.review_count;
  let newReviewed = deck.new_reviewed_today ?? 0;
  let newGraduated = deck.new_graduated_today ?? 0;
  let reviewed = deck.reviewed_today ?? 0;
  for (const sub of subs) {
    const s = getAggregateRaw(sub, allDecks);
    n += s.new_count; l += s.learning_count; r += s.review_count;
    newReviewed += s.newReviewed;
    newGraduated += s.newGraduated;
    reviewed += s.reviewed;
  }
  return { new_count: n, learning_count: l, review_count: r, newReviewed, newGraduated, reviewed };
}

/** Calculate today's pending cards for a root deck, aggregating sub-decks and respecting daily limits.
 *  When globalNewRemaining is provided (plan mode), it represents the remaining global new-card
 *  budget across ALL objective decks (already reduced by cards studied in any objective deck today). */
function getDeckTodayStats(deck: DeckWithStats, allDecks: DeckWithStats[], globalNewRemaining?: number) {
  const raw = getAggregateRaw(deck, allDecks);
  const dailyReviewLimit = deck.daily_review_limit ?? 100;

  let newAvailable: number;
  if (globalNewRemaining != null) {
    // Plan mode: cap by the shared global remaining (already accounts for all decks' reviews)
    newAvailable = Math.max(0, Math.min(raw.new_count, globalNewRemaining));
  } else {
    // Manual mode: use deck's own limit
    const dailyNewLimit = deck.daily_new_limit ?? 20;
    newAvailable = Math.max(0, Math.min(raw.new_count, dailyNewLimit - raw.newReviewed));
  }

  const reviewReviewedToday = Math.max(0, raw.reviewed - raw.newGraduated);
  const reviewAvailable = Math.max(0, Math.min(raw.review_count, dailyReviewLimit - reviewReviewedToday));
  const learningAvailable = raw.learning_count;
  const pendingToday = newAvailable + reviewAvailable + learningAvailable;
  const studiedToday = raw.reviewed;
  return { newAvailable, reviewAvailable, learningAvailable, pendingToday, studiedToday };
}

function DeckStudyCard({ deck, allDecks, avgSecondsPerCard, objectiveName, globalNewRemaining, allocatedNew }: { deck: DeckWithStats; allDecks: DeckWithStats[]; avgSecondsPerCard: number; objectiveName?: string; globalNewRemaining?: number; allocatedNew?: number }) {
  const navigate = useNavigate();
  const stats = getDeckTodayStats(deck, allDecks, allocatedNew != null ? allocatedNew : globalNewRemaining);
  const { newAvailable: rawNewAvailable, reviewAvailable, learningAvailable, studiedToday } = stats;
  // If allocatedNew is provided, override newAvailable with it (already distributed)
  const newAvailable = allocatedNew != null ? Math.min(rawNewAvailable, allocatedNew) : rawNewAvailable;
  const pendingToday = newAvailable + reviewAvailable + learningAvailable;
  const totalToday = pendingToday + studiedToday;
  const progressPercent = totalToday > 0 ? Math.round((studiedToday / totalToday) * 100) : 0;
  const estimatedMinutes = Math.round((pendingToday * avgSecondsPerCard) / 60);

  return (
    <div className="min-w-[200px] max-w-[260px] w-[72vw] sm:w-[240px] snap-center flex flex-col rounded-xl border bg-card p-3.5 space-y-2.5 shrink-0 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <h4 className="font-semibold text-sm truncate">{deck.name}</h4>
        {objectiveName && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 bg-primary/10 text-primary border-0">
            {objectiveName}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground" title="Novos">
          <SquarePlus className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground">{newAvailable}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground" title="Aprendendo">
          <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-semibold text-foreground">{learningAvailable}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground" title="Dominados">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">{reviewAvailable}</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{pendingToday > 0 ? 'Inicie seu estudo' : 'Tudo em dia!'}</span>
        {pendingToday > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Est. {formatMinutes(estimatedMinutes)}
          </span>
        )}
      </div>
      <Progress value={progressPercent} className="h-1.5" />
      <p className="text-[10px] text-muted-foreground">{studiedToday}/{totalToday} cards · {progressPercent}% concluído</p>
      <div className="flex items-center gap-2 mt-auto">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => navigate(`/study/${deck.id}`)}>
          <Play className="h-3 w-3 mr-1" /> Estudar
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8 rounded-full shrink-0" onClick={() => navigate(`/decks/${deck.id}`)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
interface DeckCarouselProps {
  decks: DeckWithStats[];
  avgSecondsPerCard?: number;
  hasPlan: boolean;
  planDeckIds?: string[];
  planDeckOrder?: string[];
  plansByDeckId?: Record<string, string>;
  globalNewRemaining?: number;
  distributedNewByDeck?: Map<string, number> | null;
}

export default function DeckCarousel({ decks, avgSecondsPerCard = 30, hasPlan, planDeckIds, planDeckOrder, plansByDeckId, globalNewRemaining, distributedNewByDeck }: DeckCarouselProps) {
  const navigate = useNavigate();

  const activeDecks = useMemo(() => {
    const roots = decks.filter(d => !d.is_archived && !d.parent_deck_id);
    if (hasPlan && planDeckIds && planDeckIds.length > 0) {
      const getRootId = (deckId: string): string | null => {
        const d = decks.find(x => x.id === deckId);
        if (!d) return null;
        if (!d.parent_deck_id) return d.id;
        return getRootId(d.parent_deck_id);
      };
      const rootIds = new Set<string>();
      for (const pid of planDeckIds) {
        const rootId = getRootId(pid);
        if (rootId) rootIds.add(rootId);
      }
      return roots.filter(d => rootIds.has(d.id));
    }
    return roots;
  }, [decks, hasPlan, planDeckIds]);

  // Sort by planDeckOrder; in plan mode show ALL plan decks (even with 0 pending)
  const sortedDecks = useMemo(() => {
    const sorted = [...activeDecks].sort((a, b) => {
      if (!planDeckOrder || planDeckOrder.length === 0) return 0;
      const aPos = planDeckOrder.indexOf(a.id);
      const bPos = planDeckOrder.indexOf(b.id);
      return (aPos === -1 ? Infinity : aPos) - (bPos === -1 ? Infinity : bPos);
    });

    if (hasPlan) {
      // In plan mode, show all plan decks (so the user sees them all)
      return sorted;
    }

    return sorted.filter(deck => {
      const allocated = distributedNewByDeck?.get(deck.id);
      const { pendingToday } = getDeckTodayStats(deck, decks, allocated != null ? allocated : globalNewRemaining);
      return pendingToday > 0;
    });
  }, [activeDecks, decks, planDeckOrder, globalNewRemaining, distributedNewByDeck, hasPlan]);

  // Global plan stats (all card types)
  const globalPlanStats = useMemo(() => {
    if (!hasPlan || !planDeckIds || planDeckIds.length === 0) return null;
    const getRootId = (deckId: string): string | null => {
      const d = decks.find(x => x.id === deckId);
      if (!d) return null;
      if (!d.parent_deck_id) return d.id;
      return getRootId(d.parent_deck_id);
    };
    const rootIds = new Set<string>();
    for (const pid of planDeckIds) {
      const rootId = getRootId(pid);
      if (rootId) rootIds.add(rootId);
    }
    let totalNew = 0, totalLearning = 0, totalReview = 0, totalStudied = 0, totalPending = 0;
    for (const rootId of rootIds) {
      const root = decks.find(d => d.id === rootId);
      if (root) {
        const allocated = distributedNewByDeck?.get(rootId);
        const stats = getDeckTodayStats(root, decks, allocated != null ? allocated : globalNewRemaining);
        const newAvail = allocated != null ? Math.min(stats.newAvailable, allocated) : stats.newAvailable;
        totalNew += newAvail;
        totalLearning += stats.learningAvailable;
        totalReview += stats.reviewAvailable;
        totalStudied += stats.studiedToday;
        totalPending += newAvail + stats.learningAvailable + stats.reviewAvailable;
      }
    }
    const totalCards = totalStudied + totalPending;
    const progress = totalCards > 0 ? Math.round((totalStudied / totalCards) * 100) : 0;
    return { totalNew, totalLearning, totalReview, totalStudied, totalPending, totalCards, progress };
  }, [decks, hasPlan, planDeckIds, globalNewRemaining, distributedNewByDeck]);

  // Stats for ALL root decks (used when no plan exists)
  const allDecksStats = useMemo(() => {
    if (hasPlan) return null;
    const roots = decks.filter(d => !d.is_archived && !d.parent_deck_id);
    let totalNew = 0, totalLearning = 0, totalReview = 0, totalStudied = 0, totalPending = 0;
    for (const root of roots) {
      const stats = getDeckTodayStats(root, decks); // no plan = use deck limits
      totalNew += stats.newAvailable;
      totalLearning += stats.learningAvailable;
      totalReview += stats.reviewAvailable;
      totalStudied += stats.studiedToday;
      totalPending += stats.pendingToday;
    }
    const totalCards = totalStudied + totalPending;
    const progress = totalCards > 0 ? Math.round((totalStudied / totalCards) * 100) : 0;
    return { totalNew, totalLearning, totalReview, totalStudied, totalPending, totalCards, progress };
  }, [decks, hasPlan]);

  // activeStats = globalPlanStats or allDecksStats
  const activeStats = globalPlanStats || allDecksStats;

  if (activeDecks.length === 0) return null;

  const estimatedTotalMinutes = activeStats
    ? Math.round((activeStats.totalPending * avgSecondsPerCard) / 60)
    : 0;

  return (
    <div className="space-y-3 mb-6">
      {/* Prompt to set up study plan */}
      {!hasPlan && (
        <button
          onClick={() => navigate('/plano')}
          className="w-full flex items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 sm:p-4 hover:bg-primary/10 transition-colors"
        >
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-foreground">Defina seu plano de estudos</p>
            <p className="text-xs text-muted-foreground truncate">Organize sua rotina e acompanhe seu progresso</p>
          </div>
        </button>
      )}

      {/* Daily study progress banner — shown for both plan and no-plan modes */}
      {activeStats && activeStats.totalCards > 0 && (
        <div className="rounded-xl border border-border/50 bg-card px-4 py-2.5 shadow-sm space-y-2">
          {/* Top row: icon counts + time estimate */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1" title="Novos">
                <SquarePlus className="h-3.5 w-3.5 text-primary" />
                <span className="font-bold text-foreground">{activeStats.totalNew}</span>
              </div>
              <div className="flex items-center gap-1" title="Aprendendo">
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-bold text-foreground">{activeStats.totalLearning}</span>
              </div>
              <div className="flex items-center gap-1" title="Revisão">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="font-bold text-foreground">{activeStats.totalReview}</span>
              </div>
            </div>
            {activeStats.totalPending > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                ~{formatMinutes(estimatedTotalMinutes)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <Progress value={activeStats.progress} className="h-1.5" />

          {/* Bottom row: card count */}
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {activeStats.totalStudied}/{activeStats.totalCards} cards · {activeStats.progress}% concluído
          </p>
        </div>
      )}

      {/* Carousel - unified list */}
      {sortedDecks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Nenhuma revisão pendente!
          </p>
        </div>
      ) : (
        <div key={sortedDecks.map(d => d.id).join(',')} className="flex overflow-x-auto snap-x snap-mandatory gap-2.5 pb-1 -mx-4 px-4 scrollbar-hide">
          {sortedDecks.map(deck => (
              <DeckStudyCard
                key={deck.id}
                deck={deck}
                allDecks={decks}
                avgSecondsPerCard={avgSecondsPerCard}
                objectiveName={plansByDeckId?.[deck.id]}
                globalNewRemaining={globalNewRemaining}
                allocatedNew={distributedNewByDeck?.get(deck.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}