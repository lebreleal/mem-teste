/**
 * DeckStatsCard – compact study action bar with mastery gauge (domínio).
 */

import { useMemo } from 'react';
import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DeckStatsCard = () => {
  const {
    studyPending, isQuickReview, totalCards, deckId, navigate,
    allCards, cardCounts,
  } = useDeckDetail();

  // Mastery = state >= 2 (dominados)
  const masteryPct = useMemo(() => {
    if (allCards.length === 0) return 0;
    const mastered = allCards.filter(c => c.state >= 2).length;
    return Math.round((mastered / allCards.length) * 1000) / 10;
  }, [allCards]);

  const newCount = cardCounts?.new_count ?? 0;
  const learningCount = cardCounts?.learning_count ?? 0;
  const masteredCount = Math.max(0, (cardCounts?.total ?? 0) - newCount - learningCount - (cardCounts?.frozen_count ?? 0));

  return (
    <div className="space-y-2 py-2">
      {/* Progress bar + mastery label */}
      <div className="flex items-center gap-2">
        <Progress value={masteryPct} className="h-2 flex-1" />
        <span className="text-xs font-bold text-foreground shrink-0">{masteryPct}%</span>
        <Popover>
          <PopoverTrigger asChild>
            <button className="p-0.5 rounded-full hover:bg-muted/50 transition-colors shrink-0">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3" side="bottom" align="end">
            <p className="text-xs font-semibold text-foreground mb-2">Domínio do deck</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Novos</span>
                <span className="text-xs font-semibold text-foreground">{newCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Aprendendo</span>
                <span className="text-xs font-semibold text-foreground">{learningCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Dominados</span>
                <span className="text-xs font-semibold text-foreground">{masteredCount}</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Study button */}
      <Button
        onClick={() => navigate(`/study/${deckId}`, { replace: true })}
        className="w-full h-12 text-base font-bold gap-2 rounded-full"
        disabled={isQuickReview ? totalCards === 0 : studyPending === 0}
      >
        ESTUDAR
        <Play className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default DeckStatsCard;
