/**
 * SessionProgressStrip — ALEKS-style real-time progress dashboard during study.
 * Shows per-deck completion, accuracy, time elapsed, and current card counter.
 */
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Flame, Target, Clock, Layers } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

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
  wrongCount,
  initialQueueSize,
  remainingCount,
  elapsedMs,
  deckStats,
}: SessionProgressStripProps) => {
  const [expanded, setExpanded] = useState(false);

  const accuracy = reviewCount > 0 ? Math.round((correctCount / reviewCount) * 100) : 0;
  const progressPercent = initialQueueSize > 0 ? Math.round(((initialQueueSize - remainingCount) / initialQueueSize) * 100) : 0;

  const completedDecks = deckStats.filter(d => d.done >= d.total && d.total > 0);
  const activeDecks = deckStats.filter(d => d.total > 0).sort((a, b) => {
    // Show in-progress first, completed last
    const aDone = a.done >= a.total ? 1 : 0;
    const bDone = b.done >= b.total ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (b.done / b.total) - (a.done / a.total);
  });

  return (
    <div className="bg-card/80 backdrop-blur-sm border-b border-border/50">
      {/* Compact strip — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs gap-2"
      >
        <div className="flex items-center gap-3">
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
        {activeDecks.length > 1 && (
          expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {/* Expanded per-deck breakdown */}
      {expanded && activeDecks.length > 1 && (
        <div className="px-3 pb-2 space-y-1.5 animate-in slide-in-from-top-2 duration-200">
          {activeDecks.slice(0, 8).map(deck => {
            const pct = deck.total > 0 ? Math.round((deck.done / deck.total) * 100) : 0;
            const isDone = deck.done >= deck.total;
            return (
              <div key={deck.deckId} className="flex items-center gap-2">
                <span className={`text-[11px] truncate flex-1 min-w-0 ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {isDone && <CheckCircle2 className="h-3 w-3 text-primary inline mr-1" />}
                  {deck.deckName}
                </span>
                <div className="w-16 flex-shrink-0">
                  <Progress value={pct} className="h-1" />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                  {deck.done}/{deck.total}
                </span>
              </div>
            );
          })}
          {activeDecks.length > 8 && (
            <p className="text-[10px] text-muted-foreground">+{activeDecks.length - 8} baralhos</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionProgressStrip;
