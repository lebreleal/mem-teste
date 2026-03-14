/**
 * SalaCard — visual card for a "Sala" (folder) on the dashboard root.
 * Shows name, subject count, aggregate mastery bar.
 */

import { ChevronRight, BookOpen } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface SalaCardProps {
  name: string;
  subjectCount: number;
  totalCards: number;
  masteredCards: number;
  dueCount: number;
  isVirtual?: boolean;
  onClick: () => void;
}

const SalaCard = ({ name, subjectCount, totalCards, masteredCards, dueCount, isVirtual, onClick }: SalaCardProps) => {
  const masteryPct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 1000) / 10 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 text-left transition-all hover:bg-muted/50 active:bg-muted/70"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
        <BookOpen className="h-5 w-5 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-display font-semibold text-foreground truncate">
          {name}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">
            {subjectCount} matéria{subjectCount !== 1 ? 's' : ''}
            {totalCards > 0 && <span> · {totalCards} cartão{totalCards !== 1 ? 'ões' : ''}</span>}
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
