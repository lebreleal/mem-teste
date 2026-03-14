/**
 * DeckStatsCard – compact study action bar with mastery gauge (domínio).
 */

import { useMemo } from 'react';
import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { Play, Settings2 } from 'lucide-react';

const DeckStatsCard = () => {
  const {
    studyPending, isQuickReview, totalCards, deckId, navigate,
    allCards,
  } = useDeckDetail();

  // Mastery = state >= 2 (dominados)
  const masteryPct = useMemo(() => {
    if (allCards.length === 0) return 0;
    const mastered = allCards.filter(c => c.state >= 2).length;
    return Math.round((mastered / allCards.length) * 100);
  }, [allCards]);

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - masteryPct / 100);

  return (
    <div className="flex items-center gap-3 py-2">
      {/* Mastery gauge */}
      <div className="relative flex-shrink-0" title={`${masteryPct}% domínio`}>
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
          <circle
            cx="28" cy="28" r={radius} fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${offset}`}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-foreground">{masteryPct}%</span>
        </div>
      </div>

      {/* Study button */}
      <Button
        onClick={() => navigate(`/study/${deckId}`, { replace: true })}
        className="flex-1 h-12 text-base font-bold gap-2 rounded-full"
        disabled={isQuickReview ? totalCards === 0 : studyPending === 0}
      >
        ESTUDAR
        <Play className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default DeckStatsCard;
