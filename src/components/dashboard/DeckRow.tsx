/**
 * DeckRow — a single deck item in the dashboard list with context menu and drag handle.
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Minus, MoreVertical, Settings, CirclePlus, ArrowUpRight, Archive, Trash2,
  ChevronRight, Link2,
} from 'lucide-react';
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
  onMove: (deck: DeckWithStats) => void;
  onArchive: (id: string) => void;
  onDelete: (deck: DeckWithStats) => void;
  dragHandlers?: DragReorderHandlers;
}

const DeckRow = ({
  deck, depth = 0, deckSelectionMode, selectedDeckIds, expandedDecks,
  toggleExpand, toggleDeckSelection, getSubDecks, getAggregateStats,
  getCommunityLinkId, navigateToCommunity,
  onCreateSubDeck, onMove, onArchive, onDelete, dragHandlers,
}: DeckRowProps) => {
  const navigate = useNavigate();
  const subDecks = getSubDecks(deck.id);
  const hasChildren = subDecks.length > 0;
  const isExpanded = expandedDecks.has(deck.id);
  const stats = getAggregateStats(deck);
  const totalDue = stats.new_count + stats.learning_count + stats.review_count;
  const isDeckSelected = selectedDeckIds.has(deck.id);

  const basePadding = depth === 0 ? 8 : 20 + depth * 24;

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
        className={`group flex items-center gap-3 px-3 sm:px-5 py-4 cursor-pointer transition-all ${isDeckSelected ? 'bg-primary/10' : 'hover:bg-muted/50'} ${depth === 0 && dragHandlers ? dragHandlers.className : ''}`}
        style={{ paddingLeft: `${basePadding}px` }}
        onClick={() => deckSelectionMode ? toggleDeckSelection(deck.id) : navigate(`/decks/${deck.id}`)}
      >
        {deckSelectionMode && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            <Checkbox checked={isDeckSelected} onCheckedChange={() => toggleDeckSelection(deck.id)} />
          </div>
        )}
        {hasChildren && (
          <button onClick={e => { e.stopPropagation(); toggleExpand(deck.id); }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors">
            {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display font-semibold text-card-foreground truncate">{deck.name}</h3>
            {(() => {
              const linkId = getCommunityLinkId(deck);
              return linkId ? (
                <button className="shrink-0 text-info hover:text-info/70 transition-colors" onClick={(e) => { e.stopPropagation(); navigateToCommunity(linkId); }} title="Ver na comunidade">
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              ) : null;
            })()}
          </div>
          <p className="text-xs text-muted-foreground">
            {deck.source_author && <span className="text-primary font-medium">por {deck.source_author} · </span>}
            {totalDue > 0 ? `Cartões para hoje: ${totalDue}` : 'Nenhum cartão para hoje'}
          </p>
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!deck.source_turma_deck_id && (
                <DropdownMenuItem onClick={() => navigate(`/decks/${deck.id}/settings`)}>
                  <Settings className="mr-2 h-4 w-4" /> Configurações
                </DropdownMenuItem>
              )}
              {!deck.source_turma_deck_id && (
                <DropdownMenuItem onClick={() => onCreateSubDeck(deck.id)}>
                  <CirclePlus className="mr-2 h-4 w-4" /> Adicionar sub-deck
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onMove(deck)}>
                <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(deck.id)}>
                <Archive className="mr-2 h-4 w-4" /> Arquivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(deck)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {isExpanded && subDecks.map(sub => (
        <DeckRow key={sub.id} {...{
          deck: sub, depth: depth + 1, deckSelectionMode, selectedDeckIds, expandedDecks,
          toggleExpand, toggleDeckSelection, getSubDecks, getAggregateStats,
          getCommunityLinkId, navigateToCommunity,
          onCreateSubDeck, onMove, onArchive, onDelete,
        }} />
      ))}
    </>
  );
};

export default DeckRow;
