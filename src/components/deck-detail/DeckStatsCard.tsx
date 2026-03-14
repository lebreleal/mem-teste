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

  // Classification by difficulty (last rating proxy)
  const counts = useMemo(() => {
    let novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0;
    for (const c of allCards) {
      if (c.state === 0) { novo++; continue; }
      const d = c.difficulty ?? 5;
      if (d <= 3) facil++;
      else if (d <= 5) bom++;
      else if (d <= 7) dificil++;
      else errei++;
    }
    return { novo, facil, bom, dificil, errei };
  }, [allCards]);

  // Mastery = state >= 2
  const masteryPct = useMemo(() => {
    if (allCards.length === 0) return 0;
    const mastered = allCards.filter(c => c.state >= 2).length;
    return Math.round((mastered / allCards.length) * 1000) / 10;
  }, [allCards]);

  const toDominate = allCards.length - counts.facil - counts.bom;

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
          <PopoverContent className="w-52 p-3" side="bottom" align="end">
            <p className="text-xs font-semibold text-foreground mb-2">Classificação dos cards</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-[#1679CA]" /> Fácil
                </span>
                <span className="text-xs font-semibold text-foreground">{counts.facil}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Bom
                </span>
                <span className="text-xs font-semibold text-foreground">{counts.bom}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> Difícil
                </span>
                <span className="text-xs font-semibold text-foreground">{counts.dificil}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-destructive" /> Errei
                </span>
                <span className="text-xs font-semibold text-foreground">{counts.errei}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Novo
                </span>
                <span className="text-xs font-semibold text-foreground">{counts.novo}</span>
              </div>
            </div>
            <div className="border-t border-border/50 mt-2 pt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cards a dominar</span>
                <span className="text-xs font-semibold text-foreground">{toDominate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total de cards</span>
                <span className="text-xs font-semibold text-foreground">{allCards.length}</span>
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
