/**
 * DeckStatsCard – compact study action bar with mastery gauge.
 */

import { useMemo } from 'react';
import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { BookOpen, Brain } from 'lucide-react';
import RetentionGauge from '@/components/RetentionGauge';

const DeckStatsCard = () => {
  const {
    studyPending, isQuickReview, totalCards, deckId, navigate,
    setExamModalOpen, allCards, deck,
  } = useDeckDetail();

  const algorithmMode = (deck as any)?.algorithm_mode ?? 'fsrs';

  const gaugeCards = useMemo(() =>
    allCards.map(c => ({
      state: c.state,
      stability: c.stability,
      difficulty: c.difficulty,
      last_reviewed_at: c.last_reviewed_at,
    })),
    [allCards]
  );

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex-1 flex gap-3">
          <Button
            onClick={() => navigate(`/study/${deckId}`, { replace: true })}
            className="flex-1 h-12 text-base font-semibold gap-2"
            disabled={isQuickReview ? totalCards === 0 : studyPending === 0}
          >
            <BookOpen className="h-5 w-5" />
            Estudar
          </Button>
          <Button
            variant="outline"
            onClick={() => setExamModalOpen(true)}
            className="h-12 gap-2 px-4"
            disabled={totalCards === 0}
            title="Criar Prova com IA"
          >
            <Brain className="h-5 w-5" />
          </Button>
        </div>
        {gaugeCards.length > 0 && (
          <RetentionGauge cards={gaugeCards} algorithmMode={algorithmMode} size={48} compact />
        )}
      </div>
    </div>
  );
};

export default DeckStatsCard;
