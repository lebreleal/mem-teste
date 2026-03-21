/**
 * SessionProgressStrip — compact real-time progress bar during study.
 * Shows card counter, time elapsed, and pause button.
 */

import { Pause } from 'lucide-react';
import { IconDeck } from '@/components/icons';

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
  onPause?: () => void;
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
  onPause,
}: SessionProgressStripProps) => {
  return (
    <div className="bg-card/80 backdrop-blur-sm border-b border-border/50">
      <div className="flex items-center justify-center px-3 py-1.5 text-xs gap-3">
        <span className="font-bold text-foreground tabular-nums flex items-center gap-1">
          <IconDeck className="h-3.5 w-3.5 text-muted-foreground" />
          {reviewCount}/{initialQueueSize}
        </span>
        <span className="text-muted-foreground tabular-nums flex items-center gap-1">
          {formatElapsed(elapsedMs)}
          {onPause && (
            <button
              onClick={onPause}
              className="ml-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Pausar sessão"
            >
              <Pause className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
};

export default SessionProgressStrip;
