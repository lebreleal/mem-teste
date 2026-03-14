/**
 * DeckRow — a single deck item in the dashboard list.
 * Shows name, sub-deck count, mastery % with progress bar.
 * Special rendering for the "📕 Caderno de Erros" deck.
 * Supports inline accordion expansion of sub-decks.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { DragReorderHandlers } from '@/hooks/useDragReorder';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
  /** Accordion mode: the ID of the currently expanded deck (only one at a time) */
  expandedAccordionId?: string | null;
  /** Called when this deck's accordion toggle is clicked */
  onAccordionToggle?: (deckId: string) => void;
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
  expandedAccordionId, onAccordionToggle,
}, ref) => {
  const navigate = useNavigate();
  const isErrorDeck = deck.name === ERROR_DECK_NAME;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const subDeckCount = useMemo(() => countAllSubDecks(deck.id, getSubDecks), [deck.id, getSubDecks]);
  const mastery = useMemo(() => getAggregateMastery(deck, getSubDecks), [deck, getSubDecks]);
  const masteryPct = mastery.total > 0 ? Math.round((mastery.mastered / mastery.total) * 1000) / 10 : 0;
  const hasSubDecks = subDeckCount > 0;
  const isExpanded = expandedAccordionId === deck.id;
  const subDecks = useMemo(() => hasSubDecks && isExpanded ? getSubDecks(deck.id) : [], [hasSubDecks, isExpanded, deck.id, getSubDecks]);

  const displayName = isErrorDeck ? 'Caderno de Erros' : deck.name;

  return (
    <>
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
        className={`group flex items-center gap-3 px-4 py-4 cursor-pointer transition-all hover:bg-muted/50 ${depth === 0 && dragHandlers ? dragHandlers.className : ''} ${depth > 0 ? 'pl-8 bg-muted/20' : ''}`}
        onClick={() => deckSelectionMode ? toggleDeckSelection(deck.id) : navigate(isErrorDeck ? '/caderno-de-erros' : `/decks/${deck.id}`)}
      >
        {/* Accordion toggle for parent decks */}
        {hasSubDecks && depth === 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onAccordionToggle?.(deck.id); }}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -ml-1"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-foreground truncate">{displayName}</h3>
            {isErrorDeck && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowInfoModal(true); }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="h-4 w-4" />
              </button>
            )}
            {hasPendingUpdate && (
              <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-destructive animate-pulse" title="Atualização disponível" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground">
              {isErrorDeck
                ? <span>{mastery.total} cartão{mastery.total !== 1 ? 'ões' : ''} para revisar</span>
                : subDeckCount > 0
                  ? <span>{subDeckCount} sub-deck{subDeckCount !== 1 ? 's' : ''}</span>
                  : <span>{mastery.total} cartão{mastery.total !== 1 ? 'ões' : ''}</span>
              }
            </p>
            <span className="text-xs text-muted-foreground ml-auto">{masteryPct}%</span>
          </div>
          <Progress value={masteryPct} className="h-1 mt-1.5" />
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {/* Expanded sub-decks (accordion) */}
      {isExpanded && subDecks.length > 0 && (
        <div className="border-l-2 border-primary/20 ml-4">
          {subDecks.map(sub => {
            const subMastery = getAggregateMastery(sub, getSubDecks);
            const subPct = subMastery.total > 0 ? Math.round((subMastery.mastered / subMastery.total) * 1000) / 10 : 0;
            return (
              <div
                key={sub.id}
                className="flex items-center gap-3 pl-4 pr-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => navigate(`/decks/${sub.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground truncate">{sub.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{subMastery.total} cartão{subMastery.total !== 1 ? 'ões' : ''}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{subPct}%</span>
                  </div>
                  <Progress value={subPct} className="h-0.5 mt-1" />
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Info modal for error deck */}
      <Dialog open={showInfoModal} onOpenChange={setShowInfoModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>📕 Caderno de Erros</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-2">
              Este deck reúne automaticamente os cartões que você errou durante suas sessões de estudo.
              Revise-os aqui para fortalecer os pontos mais fracos e melhorar sua retenção geral.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
});

DeckRow.displayName = 'DeckRow';

export default DeckRow;
