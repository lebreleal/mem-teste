import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Play, CalendarCheck, SquarePlus, RotateCcw, Layers } from 'lucide-react';
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

/** Calculate today's pending cards for a root deck, aggregating sub-decks and respecting daily limits */
function getDeckTodayStats(deck: DeckWithStats, allDecks: DeckWithStats[]) {
  const raw = getAggregateRaw(deck, allDecks);
  const dailyNewLimit = deck.daily_new_limit ?? 20;
  const dailyReviewLimit = deck.daily_review_limit ?? 100;

  const newAvailable = Math.max(0, Math.min(raw.new_count, dailyNewLimit - raw.newReviewed));
  const reviewReviewedToday = Math.max(0, raw.reviewed - raw.newGraduated);
  const reviewAvailable = Math.max(0, Math.min(raw.review_count, dailyReviewLimit - reviewReviewedToday));
  const learningAvailable = raw.learning_count;
  const pendingToday = newAvailable + reviewAvailable + learningAvailable;
  const studiedToday = raw.reviewed;
  return { newAvailable, reviewAvailable, learningAvailable, pendingToday, studiedToday };
}

function DeckStudyCard({ deck, allDecks, avgSecondsPerCard, objectiveName, isDone }: { deck: DeckWithStats; allDecks: DeckWithStats[]; avgSecondsPerCard: number; objectiveName?: string; isDone?: boolean }) {
  const navigate = useNavigate();
  const { newAvailable, reviewAvailable, learningAvailable, pendingToday, studiedToday } = getDeckTodayStats(deck, allDecks);
  const totalToday = pendingToday + studiedToday;
  const progressPercent = totalToday > 0 ? Math.round((studiedToday / totalToday) * 100) : 0;
  const estimatedMinutes = Math.round((pendingToday * avgSecondsPerCard) / 60);

  return (
    <div className={`min-w-[200px] max-w-[260px] w-[72vw] sm:w-[240px] snap-center flex flex-col rounded-xl border bg-card p-3.5 space-y-2.5 shrink-0 shadow-sm transition-opacity ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <h4 className="font-semibold text-sm truncate">{deck.name}</h4>
        {objectiveName && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 bg-primary/10 text-primary border-0">
            {objectiveName}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <SquarePlus className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground">{newAvailable}</span>
          <span>Novos</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5 text-green-500" />
          <span className="font-semibold text-foreground">{reviewAvailable + learningAvailable}</span>
          <span>Revisões</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">{studiedToday}</span>
          <span>Feitos</span>
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
}

export default function DeckCarousel({ decks, avgSecondsPerCard = 30, hasPlan, planDeckIds, planDeckOrder, plansByDeckId }: DeckCarouselProps) {
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

  // Sort by planDeckOrder, then split pending first, done last
  const sortedDecks = useMemo(() => {
    const pending: DeckWithStats[] = [];
    const done: DeckWithStats[] = [];

    // Sort activeDecks by planDeckOrder position
    const sorted = [...activeDecks].sort((a, b) => {
      if (!planDeckOrder || planDeckOrder.length === 0) return 0;
      const ai = planDeckOrder.indexOf(a.id);
      const bi = planDeckOrder.indexOf(b.id);
      const aPos = ai === -1 ? Infinity : ai;
      const bPos = bi === -1 ? Infinity : bi;
      return aPos - bPos;
    });

    for (const deck of sorted) {
      const { pendingToday } = getDeckTodayStats(deck, decks);
      if (pendingToday > 0) pending.push(deck);
      else done.push(deck);
    }
    return [...pending, ...done];
  }, [activeDecks, decks, planDeckOrder]);

  if (activeDecks.length === 0) return null;

  const totalPending = sortedDecks.reduce((sum, d) => {
    const { pendingToday } = getDeckTodayStats(d, decks);
    return sum + pendingToday;
  }, 0);
  const doneCount = sortedDecks.filter(d => getDeckTodayStats(d, decks).pendingToday === 0).length;

  return (
    <div className="space-y-3 mb-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-bold">Baralhos de hoje</h2>
          <p className="text-xs text-muted-foreground">
            {doneCount} de {activeDecks.length} concluídos · {totalPending} cards pendentes
          </p>
        </div>
      </div>

      {/* Prompt to set up study plan */}
      {!hasPlan && (
        <button
          onClick={() => navigate('/plano')}
          className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 hover:bg-primary/10 transition-colors"
        >
          <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-left">
            <span className="font-semibold text-foreground">Defina seu plano de estudos</span>
            <span className="text-muted-foreground"> — organize sua rotina e acompanhe seu progresso.</span>
          </p>
        </button>
      )}

      {/* Carousel - unified list */}
      {sortedDecks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">🎉 Tudo concluído por hoje!</p>
        </div>
      ) : (
        <div key={sortedDecks.map(d => d.id).join(',')} className="flex overflow-x-auto snap-x snap-mandatory gap-2.5 pb-1 -mx-4 px-4 scrollbar-hide">
          {sortedDecks.map(deck => {
            const { pendingToday } = getDeckTodayStats(deck, decks);
            return (
              <DeckStudyCard
                key={deck.id}
                deck={deck}
                allDecks={decks}
                avgSecondsPerCard={avgSecondsPerCard}
                objectiveName={plansByDeckId?.[deck.id]}
                isDone={pendingToday === 0}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
