/**
 * SessionProgressStrip — compact real-time progress bar during study.
 * Shows card counter, accuracy, and time elapsed.
 */
import { CheckCircle2, Target, Clock, Layers } from 'lucide-react';

export interface DeckSessionStats {
  deckId: string;
  deckName: string;
  total: number;
  done: number;
  correct: number;
  wrong: number;
}

interface SessionProgressStripProps {
  reviewCount: number;
  correctCount: number;
  wrongCount: number;
  initialQueueSize: number;
  remainingCount: number;
  elapsedMs: number;
  deckStats: DeckSessionStats[];
}

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SessionProgressStrip = ({
  reviewCount,
  correctCount,
  initialQueueSize,
  elapsedMs,
  deckStats,
}: SessionProgressStripProps) => {
  const accuracy = reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : 0;
  const completedDecks = deckStats.filter(d => d.done >= d.total && d.total > 0);

  return (
    <div className="bg-card/80 backdrop-blur-sm border-b border-border/50">
      <div className="flex items-center px-3 py-1.5 text-xs gap-3">
        <span className="flex items-center gap-1 font-bold text-foreground tabular-nums">
          <Layers className="h-3 w-3 text-primary" />
          {reviewCount}/{initialQueueSize}
        </span>
        {accuracy > 0 && (
          <span className="flex items-center gap-1 tabular-nums" style={{ color: accuracy >= 80 ? 'hsl(var(--primary))' : accuracy >= 60 ? 'hsl(var(--warning, 45 100% 50%))' : 'hsl(var(--destructive))' }}>
            <Target className="h-3 w-3" />
            {accuracy}%
          </span>
        )}
        <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
          <Clock className="h-3 w-3" />
          {formatElapsed(elapsedMs)}
        </span>
        {completedDecks.length > 0 && (
          <span className="flex items-center gap-1 text-primary">
            <CheckCircle2 className="h-3 w-3" />
            {completedDecks.length}
          </span>
        )}
      </div>
    </div>
  );
};

export default SessionProgressStrip;
