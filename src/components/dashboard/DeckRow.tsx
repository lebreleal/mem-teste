/**
 * DeckRow — a single deck item in the dashboard list.
 * Shows name, sub-deck count, mastery % with progress bar.
 * Special rendering for the "📕 Caderno de Erros" deck.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { FileX2 } from 'lucide-react';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { DragReorderHandlers } from '@/hooks/useDragReorder';

const ERROR_DECK_NAME = '📕 Caderno de Erros';

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

/** Recursively aggregate total_cards and mastered_cards */
function getAggregateMastery(deck: DeckWithStats, getSubDecks: (id: string) => DeckWithStats[]): { total: number; mastered: number } {
  let total = deck.total_cards;
  let mastered = deck.mastered_cards;
  const subs = getSubDecks(deck.id);
  for (const sub of subs) {
    const sub_m = getAggregateMastery(sub, getSubDecks);
    total += sub_m.total;
    mastered += sub_m.mastered;
  }
  return { total, mastered };
}

const DeckRow = React.forwardRef<HTMLDivElement, DeckRowProps>(({
  deck, depth = 0, deckSelectionMode, selectedDeckIds,
  toggleDeckSelection, getSubDecks,
  dragHandlers, hasPendingUpdate,
}, ref) => {
  const navigate = useNavigate();
  const isErrorDeck = deck.name === ERROR_DECK_NAME;
  const subDeckCount = useMemo(() => countAllSubDecks(deck.id, getSubDecks), [deck.id, getSubDecks]);
  const mastery = useMemo(() => getAggregateMastery(deck, getSubDecks), [deck, getSubDecks]);
  const masteryPct = mastery.total > 0 ? Math.round((mastery.mastered / mastery.total) * 1000) / 10 : 0;

  const displayName = isErrorDeck ? 'Caderno de Erros' : deck.name;

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
      onClick={() => deckSelectionMode ? toggleDeckSelection(deck.id) : navigate(isErrorDeck ? '/error-notebook' : `/decks/${deck.id}`)}
    >
      {isErrorDeck && (
        <div className="flex h-10 w-8 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 shrink-0">
          <FileX2 className="h-5 w-5 text-destructive" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-foreground truncate">{displayName}</h3>
          {hasPendingUpdate && (
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-destructive animate-pulse" title="Atualização disponível" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-muted-foreground">
            {isErrorDeck
              ? <span>{mastery.total} cartão{mastery.total !== 1 ? 'ões' : ''} para revisar</span>
              : subDeckCount > 0
                ? <span>{subDeckCount} deck{subDeckCount !== 1 ? 's' : ''}</span>
                : <span>{mastery.total} cartão{mastery.total !== 1 ? 'ões' : ''}</span>
            }
          </p>
          <span className="text-xs text-muted-foreground ml-auto">{masteryPct}%</span>
        </div>
        <Progress value={masteryPct} className="h-1 mt-1.5" />
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
});

DeckRow.displayName = 'DeckRow';

export default DeckRow;
