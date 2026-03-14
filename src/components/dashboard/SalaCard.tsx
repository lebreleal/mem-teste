/**
 * SalaCard — visual card for a "Sala" (folder) on the dashboard root.
 * Shows custom image (or default brain icon), name, subject count, mastery bar.
 */

import { ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

interface SalaCardProps {
  name: string;
  subjectCount: number;
  totalCards: number;
  masteredCards: number;
  dueCount: number;
  isVirtual?: boolean;
  imageUrl?: string | null;
  onClick: () => void;
}

const SalaCard = ({ name, subjectCount, totalCards, masteredCards, dueCount, isVirtual, imageUrl, onClick }: SalaCardProps) => {
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
