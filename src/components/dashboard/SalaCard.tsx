/**
 * SalaCard — visual card for a "Classe" (folder) on the dashboard root.
 * Shows custom image (or default icon), name, deck/card/question counts, mastery bar.
 */

import { ChevronRight, Layers, HelpCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

interface SalaCardProps {
  name: string;
  deckCount: number;
  totalCards: number;
  masteredCards: number;
  questionCount: number;
  dueCount: number;
  isVirtual?: boolean;
  imageUrl?: string | null;
  onClick: () => void;
}

const SalaCard = ({ name, deckCount, totalCards, masteredCards, questionCount, dueCount, isVirtual, imageUrl, onClick }: SalaCardProps) => {
  const masteryPct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 1000) / 10 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all hover:bg-muted/50 active:bg-muted/70"
    >
      <img
        src={imageUrl || defaultSalaIcon}
        alt={name}
        className="h-10 w-10 rounded-xl object-cover shrink-0"
      />

      <div className="flex-1 min-w-0">
        <h3 className="font-display font-semibold text-foreground truncate">
          {name}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span>{deckCount} {deckCount === 1 ? 'deck' : 'decks'}</span>
            {totalCards > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Layers className="h-3 w-3" />
                  {totalCards}
                </span>
              </>
            )}
            {questionCount > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <HelpCircle className="h-3 w-3" />
                  {questionCount}
                </span>
              </>
            )}
          </p>
          <span className="text-xs text-muted-foreground ml-auto">{masteryPct}%</span>
        </div>
        <Progress value={masteryPct} className="h-1 mt-1.5" />
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
};

export default SalaCard;
