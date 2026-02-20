import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Play, CalendarCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

function DeckStudyCard({ deck, allDecks, avgSecondsPerCard }: { deck: DeckWithStats; allDecks: DeckWithStats[]; avgSecondsPerCard: number }) {
  const navigate = useNavigate();
  const { newAvailable, reviewAvailable, learningAvailable, pendingToday, studiedToday } = getDeckTodayStats(deck, allDecks);
  const totalToday = pendingToday + studiedToday;
  const progressPercent = totalToday > 0 ? Math.round((studiedToday / totalToday) * 100) : 0;
  const estimatedMinutes = Math.round((pendingToday * avgSecondsPerCard) / 60);

  return (
    <div className="min-w-[240px] max-w-[280px] snap-start flex flex-col rounded-xl border bg-card p-3.5 space-y-2.5 shrink-0 shadow-sm">
      <h4 className="font-semibold text-sm truncate">{deck.name}</h4>
      <div className="flex gap-1.5 flex-wrap">
        {newAvailable > 0 && <Badge variant="outline" className="text-[10px] h-5 border-blue-300 text-blue-600 dark:text-blue-400">{newAvailable} novos</Badge>}
        {reviewAvailable > 0 && <Badge variant="outline" className="text-[10px] h-5 border-emerald-300 text-emerald-600 dark:text-emerald-400">{reviewAvailable} revisões</Badge>}
        {learningAvailable > 0 && <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-600 dark:text-amber-400">{learningAvailable} aprendendo</Badge>}
        {pendingToday === 0 && <Badge variant="secondary" className="text-[10px] h-5">✓ Concluído</Badge>}
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
        <Button size="icon" variant="outline" className="h-8 w-8 rounded-full shrink-0" onClick={() => navigate(`/deck/${deck.id}`)}>
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
}

export default function DeckCarousel({ decks, avgSecondsPerCard = 30, hasPlan }: DeckCarouselProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');

  // Only show root-level non-archived decks with cards
  const activeDecks = useMemo(() =>
    decks.filter(d => !d.is_archived && !d.parent_deck_id),
    [decks]
  );

  const { pendingDecks, doneDecks } = useMemo(() => {
    const pending: DeckWithStats[] = [];
    const done: DeckWithStats[] = [];
    for (const deck of activeDecks) {
      const { pendingToday } = getDeckTodayStats(deck, decks);
      if (pendingToday > 0) pending.push(deck);
      else done.push(deck);
    }
    return { pendingDecks: pending, doneDecks: done };
  }, [activeDecks, decks]);

  const filteredDecks = activeTab === 'pending' ? pendingDecks : doneDecks;

  if (activeDecks.length === 0) return null;

  const totalPending = pendingDecks.reduce((sum, d) => sum + getDeckTodayStats(d, decks).pendingToday, 0);

  return (
    <div className="space-y-3 mb-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-bold">Baralhos de hoje</h2>
          <p className="text-xs text-muted-foreground">
            {doneDecks.length} de {activeDecks.length} concluídos · {totalPending} cards pendentes
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'done')}>
          <TabsList className="h-8">
            <TabsTrigger value="pending" className="text-[11px] px-2.5 h-7">Pendentes ({pendingDecks.length})</TabsTrigger>
            <TabsTrigger value="done" className="text-[11px] px-2.5 h-7">Feitos ({doneDecks.length})</TabsTrigger>
          </TabsList>
        </Tabs>
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

      {/* Carousel */}
      {filteredDecks.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {activeTab === 'pending' ? '🎉 Tudo concluído por hoje!' : 'Nenhum baralho concluído ainda.'}
          </p>
        </div>
      ) : (
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1 -mx-4 px-4 scrollbar-hide">
          {filteredDecks.map(deck => (
            <DeckStudyCard key={deck.id} deck={deck} allDecks={decks} avgSecondsPerCard={avgSecondsPerCard} />
          ))}
        </div>
      )}
    </div>
  );
}
