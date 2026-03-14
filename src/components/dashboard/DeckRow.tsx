/**
 * DeckRow — a single deck item in the dashboard list.
 * Simplified: shows name, sub-deck count, cards for today, chevron.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { DragReorderHandlers } from '@/hooks/useDragReorder';

interface DeckRowProps {
  deck: DeckWithStats;
  depth?: number;
  deckSelectionMode: boolean;
  selectedDeckIds: Set<string>;
  expandedDecks: Set<string>;
  toggleExpand: (id: string) => void;
  toggleDeckSelection: (id: string) => void;
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  getCommunityLinkId: (deck: DeckWithStats) => string | null;
  navigateToCommunity: (id: string) => void;
  onCreateSubDeck: (deckId: string) => void;
  onRename: (deck: DeckWithStats) => void;
  onMove: (deck: DeckWithStats) => void;
  onArchive: (id: string) => void;
  onDelete: (deck: DeckWithStats) => void;
  onDetachCommunityDeck?: (deck: DeckWithStats) => void;
  dragHandlers?: DragReorderHandlers;
  hasPendingUpdate?: boolean;
}

/** Recursively count all descendant decks */
function countAllSubDecks(deckId: string, getSubDecks: (id: string) => DeckWithStats[]): number {
  const subs = getSubDecks(deckId);
  let count = subs.length;
  for (const sub of subs) count += countAllSubDecks(sub.id, getSubDecks);
  return count;
}

const DeckRow = React.forwardRef<HTMLDivElement, DeckRowProps>(({
  deck, depth = 0, deckSelectionMode, selectedDeckIds,
  toggleDeckSelection, getSubDecks, getAggregateStats,
  dragHandlers, hasPendingUpdate,
}, ref) => {
  const navigate = useNavigate();
  const stats = getAggregateStats(deck);
  const totalDue = stats.new_count + stats.learning_count + stats.review_count;
  const subDeckCount = useMemo(() => countAllSubDecks(deck.id, getSubDecks), [deck.id, getSubDecks]);
  const allCaughtUp = totalDue === 0 && (stats.reviewed_today > 0 || subDeckCount > 0);

  return (
    <div
      {...(depth === 0 && dragHandlers ? {
        draggable: dragHandlers.draggable,
        onDragStart: dragHandlers.onDragStart,
        onDragOver: dragHandlers.onDragOver,
        onDragEnter: dragHandlers.onDragEnter,
        onDragLeave: dragHandlers.onDragLeave,
        onDrop: dragHandlers.onDrop,
        onDragEnd: dragHandlers.onDragEnd,
      } : {})}
      className={`group flex items-center gap-3 px-4 py-4 cursor-pointer transition-all hover:bg-muted/50 ${depth === 0 && dragHandlers ? dragHandlers.className : ''}`}
      onClick={() => deckSelectionMode ? toggleDeckSelection(deck.id) : navigate(`/decks/${deck.id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-foreground truncate">{deck.name}</h3>
          {allCaughtUp && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
          {hasPendingUpdate && (
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-destructive animate-pulse" title="Atualização disponível" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {subDeckCount > 0 && <span>{subDeckCount} sub-deck{subDeckCount !== 1 ? 's' : ''} · </span>}
          {totalDue > 0
            ? <span className="text-primary font-medium">{totalDue} cartões para hoje</span>
            : <span>Nenhum cartão para hoje</span>
          }
        </p>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
});

DeckRow.displayName = 'DeckRow';

export default DeckRow;
