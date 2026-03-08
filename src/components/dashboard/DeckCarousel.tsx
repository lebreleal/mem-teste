import { useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Play, SquarePlus, RotateCcw, Layers, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DeckWithStats } from '@/types/deck';

type AggregateStats = { new_count: number; learning_count: number; review_count: number; newReviewed: number; newGraduated: number; reviewed: number };

function formatMinutes(m: number) {
  if (m <= 0) return '0min';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

/** Pre-compute aggregate stats for ALL decks into a Map for O(1) lookup. */
function buildAggregateMap(allDecks: DeckWithStats[]): Map<string, AggregateStats> {
  // Build children map once
  const childrenMap = new Map<string, DeckWithStats[]>();
  for (const d of allDecks) {
    if (d.parent_deck_id && !d.is_archived) {
      const list = childrenMap.get(d.parent_deck_id) ?? [];
      list.push(d);
      childrenMap.set(d.parent_deck_id, list);
    }
  }

  const cache = new Map<string, { new_count: number; learning_count: number; review_count: number; newReviewed: number; newGraduated: number; reviewed: number }>();

  function compute(deck: DeckWithStats) {
    if (cache.has(deck.id)) return cache.get(deck.id)!;
    let n = deck.new_count, l = deck.learning_count, r = deck.review_count;
    let newReviewed = deck.new_reviewed_today ?? 0;
    let newGraduated = deck.new_graduated_today ?? 0;
    let reviewed = deck.reviewed_today ?? 0;
    for (const sub of childrenMap.get(deck.id) ?? []) {
      const s = compute(sub);
      n += s.new_count; l += s.learning_count; r += s.review_count;
      newReviewed += s.newReviewed;
      newGraduated += s.newGraduated;
      reviewed += s.reviewed;
    }
    const result = { new_count: n, learning_count: l, review_count: r, newReviewed, newGraduated, reviewed };
    cache.set(deck.id, result);
    return result;
  }

  for (const d of allDecks) compute(d);
  return cache;
}

/** Calculate today's pending cards for a root deck, aggregating sub-decks and respecting daily limits.
 *  When globalNewRemaining is provided (plan mode), it represents the remaining global new-card
 *  budget across ALL objective decks (already reduced by cards studied in any objective deck today). */
function getDeckTodayStats(deck: DeckWithStats, aggregateMap: Map<string, AggregateStats>, globalNewRemaining?: number) {
  const raw = aggregateMap.get(deck.id) ?? { new_count: 0, learning_count: 0, review_count: 0, newReviewed: 0, newGraduated: 0, reviewed: 0 };
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

function DeckStudyCard({ deck, aggregateMap, avgSecondsPerCard, objectiveName, globalNewRemaining, allocatedNew }: { deck: DeckWithStats; aggregateMap: Map<string, AggregateStats>; avgSecondsPerCard: number; objectiveName?: string; globalNewRemaining?: number; allocatedNew?: number }) {
  const navigate = useNavigate();
  const stats = getDeckTodayStats(deck, aggregateMap, allocatedNew != null ? allocatedNew : globalNewRemaining);
  const { newAvailable: rawNewAvailable, reviewAvailable, learningAvailable, studiedToday } = stats;
  // If allocatedNew is provided, override newAvailable with it (already distributed)
  const newAvailable = allocatedNew != null ? Math.min(rawNewAvailable, allocatedNew) : rawNewAvailable;
  const pendingToday = newAvailable + reviewAvailable + learningAvailable;
  const totalToday = pendingToday + studiedToday;
  const progressPercent = totalToday > 0 ? Math.round((studiedToday / totalToday) * 100) : 0;
  const estimatedMinutes = Math.round((pendingToday * avgSecondsPerCard) / 60);

  const isComplete = pendingToday === 0 && totalToday > 0;

  return (
    <div className={`min-w-[200px] max-w-[260px] w-[72vw] sm:w-[240px] snap-center flex flex-col rounded-xl border bg-card p-3.5 space-y-2.5 shrink-0 shadow-sm transition-opacity ${isComplete ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <h4 className="font-semibold text-sm truncate flex items-center gap-1">
          {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
          {deck.name}
        </h4>
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

  // Pre-compute aggregate stats once — O(n) instead of O(n²) per render
  const aggregateMap = useMemo(() => buildAggregateMap(decks), [decks]);
  // Desktop drag-to-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDragged = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStartX.current = e.pageX;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const dx = e.pageX - dragStartX.current;
    if (Math.abs(dx) > 3) hasDragged.current = true;
    scrollRef.current.scrollLeft = dragScrollLeft.current - dx;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  }, []);

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

  const sortedDecks = useMemo(() => {
    const sorted = [...activeDecks].sort((a, b) => {
      if (!planDeckOrder || planDeckOrder.length === 0) return 0;
      const aPos = planDeckOrder.indexOf(a.id);
      const bPos = planDeckOrder.indexOf(b.id);
      return (aPos === -1 ? Infinity : aPos) - (bPos === -1 ? Infinity : bPos);
    });

    // Move completed decks (0 pending) to the end instead of hiding them
    return [...sorted].sort((a, b) => {
      const allocA = distributedNewByDeck?.get(a.id);
      const allocB = distributedNewByDeck?.get(b.id);
      const pendA = getDeckTodayStats(a, aggregateMap, allocA != null ? allocA : globalNewRemaining).pendingToday;
      const pendB = getDeckTodayStats(b, aggregateMap, allocB != null ? allocB : globalNewRemaining).pendingToday;
      if (pendA > 0 && pendB === 0) return -1;
      if (pendA === 0 && pendB > 0) return 1;
      return 0;
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
    let totalLearning = 0, totalReview = 0, totalStudied = 0;
    for (const rootId of rootIds) {
      const root = decks.find(d => d.id === rootId);
      if (root) {
        const allocated = distributedNewByDeck?.get(rootId);
        const stats = getDeckTodayStats(root, aggregateMap, allocated != null ? allocated : globalNewRemaining);
        totalLearning += stats.learningAvailable;
        totalReview += stats.reviewAvailable;
        totalStudied += stats.studiedToday;
      }
    }
    // Banner shows the global limit directly, not the sum of per-deck new cards
    const totalNew = globalNewRemaining != null ? globalNewRemaining : 0;
    const totalPending = totalNew + totalLearning + totalReview;
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
      const stats = getDeckTodayStats(root, aggregateMap); // no plan = use deck limits
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

  const hasNoDecksAtAll = decks.filter(d => !d.is_archived).length === 0;

  if (activeDecks.length === 0 && !hasNoDecksAtAll) return null;

  const estimatedTotalMinutes = activeStats
    ? Math.round((activeStats.totalPending * avgSecondsPerCard) / 60)
    : 0;

  return (
    <div className="space-y-3 mb-6">
      {/* Study plan prompt removed — users access via "Meu Plano" nav button */}

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

      {/* Carousel - unified list (only show when there are decks to display) */}
      {sortedDecks.length > 0 && (
        <div
          ref={scrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          key={sortedDecks.map(d => d.id).join(',')}
          className="flex overflow-x-auto snap-x snap-mandatory gap-2.5 pb-1 -mx-4 px-4 scrollbar-hide cursor-grab select-none"
        >
          {sortedDecks.map(deck => (
            <DeckStudyCard
              key={deck.id}
              deck={deck}
              aggregateMap={aggregateMap}
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