/**
 * SessionProgressStrip — compact real-time progress bar during study.
 * Shows card counter, accuracy, and time elapsed.
 */

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
  initialQueueSize,
  elapsedMs,
}: SessionProgressStripProps) => {
  return (
    <div className="bg-card/80 backdrop-blur-sm border-b border-border/50">
      <div className="flex items-center justify-center px-3 py-1.5 text-xs gap-3">
        <span className="font-bold text-foreground tabular-nums">
          {reviewCount}/{initialQueueSize}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatElapsed(elapsedMs)}
        </span>
      </div>
    </div>
  );
};

export default SessionProgressStrip;
