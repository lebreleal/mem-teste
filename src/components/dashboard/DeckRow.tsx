/**
 * DeckRow — a single deck item in the dashboard list.
 * Shows name, card count, 4-color progress bar (novo/aprendendo/revisão/dominado).
 * If the deck has sub-decks, shows an expand/collapse icon.
 * 3-dot menu + play icon: visible on hover for loose decks, on expand for matérias.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, ChevronDown, Layers, HelpCircle, Lock, MoreVertical, Pencil, FolderInput, Archive, Trash2, Settings, Plus, Minus, Play } from 'lucide-react';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { DragReorderHandlers } from '@/hooks/useDragReorder';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ERROR_DECK_NAME = '📕 Caderno de Erros';

/**
 * 4-color progress bar by card classification:
 *  - green (dominado): mastered, not due
 *  - primary/blue (revisão): due for review
 *  - destructive/red (errando): learning/relearning
 *  - muted/gray (novo): never seen
 */
const ClassificationBar = ({ newPct, learningPct, reviewPct, masteredPct, className = '' }: {
  newPct: number; learningPct: number; reviewPct: number; masteredPct: number; className?: string;
}) => (
  <div className={`relative h-1 w-full overflow-hidden rounded-full bg-muted/30 ${className}`}>
    <div className="absolute inset-y-0 left-0 flex w-full">
      {masteredPct > 0 && (
        <div
          className="h-full transition-all duration-500 rounded-l-full"
          style={{ width: `${masteredPct}%`, backgroundColor: 'hsl(142 71% 45%)' }}
        />
      )}
      {reviewPct > 0 && (
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${reviewPct}%` }}
        />
      )}
      {learningPct > 0 && (
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${learningPct}%`, backgroundColor: 'hsl(0 84% 60%)' }}
        />
      )}
      {newPct > 0 && (
        <div
          className="h-full bg-muted transition-all duration-500 rounded-r-full"
          style={{ width: `${newPct}%` }}
        />
      )}
    </div>
  </div>
);

/** Reusable 3-dot dropdown menu for deck actions */
const DeckMenu = ({ deck, onRename, onMove, onArchive, onDelete, navigate }: {
  deck: DeckWithStats;
  onRename: (d: DeckWithStats) => void;
  onMove: (d: DeckWithStats) => void;
  onArchive: (id: string) => void;
  onDelete: (d: DeckWithStats) => void;
  navigate: (path: string) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuItem onClick={() => onRename(deck)}>
        <Pencil className="h-4 w-4 mr-2" /> Renomear
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate(`/decks/${deck.id}/settings`)}>
        <Settings className="h-4 w-4 mr-2" /> Configurações
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onMove(deck)}>
        <FolderInput className="h-4 w-4 mr-2" /> Mover
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onArchive(deck.id)}>
        <Archive className="h-4 w-4 mr-2" /> Arquivar
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onDelete(deck)} className="text-destructive focus:text-destructive">
        <Trash2 className="h-4 w-4 mr-2" /> Excluir
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

interface DeckRowProps {
  deck: DeckWithStats;
  deckSelectionMode: boolean;
  selectedDeckIds: Set<string>;
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
  expandedDecks: Set<string>;
  toggleExpand: (id: string) => void;
  expandedAccordionId?: string | null;
  onAccordionToggle?: (deckId: string) => void;
  questionCountMap?: Map<string, number>;
}

/** Compute mastery percentage: mastered = total - new - learning - review */
function computeMasteryPct(stats: { new_count: number; learning_count: number; review_count: number }, totalCards: number): number {
  if (totalCards === 0) return 0;
  const masteredCount = Math.max(0, totalCards - stats.new_count - stats.learning_count - stats.review_count);
  return (masteredCount / totalCards) * 100;
}


const DeckRow = React.forwardRef<HTMLDivElement, DeckRowProps>(({
  deck, deckSelectionMode, selectedDeckIds,
  toggleDeckSelection, getSubDecks, getAggregateStats,
  onRename, onMove, onArchive, onDelete,
  dragHandlers, hasPendingUpdate,
  expandedAccordionId, onAccordionToggle,
  questionCountMap,
}, ref) => {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const isErrorDeck = deck.name === ERROR_DECK_NAME;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);

  const subDecks = useMemo(() => getSubDecks(deck.id), [deck.id, getSubDecks]);
  const hasChildren = subDecks.length > 0;
  const isExpanded = expandedAccordionId === deck.id;

  // Aggregate totals: this deck + all sub-decks
  const { totalCards, aggStats } = useMemo(() => {
    let total = deck.total_cards;
    const collectSubs = (parentId: string) => {
      const subs = getSubDecks(parentId);
      for (const s of subs) {
        total += s.total_cards;
        collectSubs(s.id);
      }
    };
    collectSubs(deck.id);
    return { totalCards: total, aggStats: getAggregateStats(deck) };
  }, [deck, getSubDecks, getAggregateStats]);

  const masteryPct = computeMasteryPct(aggStats, totalCards);
  const displayName = isErrorDeck ? 'Caderno de Erros' : deck.name;
  const hasDueCards = aggStats.new_count + aggStats.learning_count + aggStats.review_count > 0;

  const handleClick = () => {
    if (deckSelectionMode) {
      toggleDeckSelection(deck.id);
      return;
    }
    if (isErrorDeck) {
      if (isAdmin) {
        navigate('/caderno-de-erros');
      } else {
        setShowDevModal(true);
      }
      return;
    }
    if (hasChildren) {
      onAccordionToggle?.(deck.id);
    } else {
      // Navigate to deck detail
      navigate(`/decks/${deck.id}`);
    }
  };

  const handleStudy = (e: React.MouseEvent, deckId: string) => {
    e.stopPropagation();
    navigate(`/study/deck/${deckId}`);
  };

  return (
    <>
      <div
        {...(dragHandlers ? {
          draggable: dragHandlers.draggable,
          onDragStart: dragHandlers.onDragStart,
          onDragOver: dragHandlers.onDragOver,
          onDragEnter: dragHandlers.onDragEnter,
          onDragLeave: dragHandlers.onDragLeave,
          onDrop: dragHandlers.onDrop,
          onDragEnd: dragHandlers.onDragEnd,
        } : {})}
        className={`group flex items-center gap-3 px-4 py-4 cursor-pointer transition-all hover:bg-muted/50 ${dragHandlers ? dragHandlers.className : ''}`}
        onClick={handleClick}
      >
        {/* Expand/collapse icon for decks with children */}
        {hasChildren && (
          isExpanded
            ? <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
            : <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
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
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              {hasChildren && (
                <>
                  <span>{subDecks.length} {subDecks.length === 1 ? 'deck' : 'decks'}</span>
                  <span>·</span>
                </>
              )}
              <span className="inline-flex items-center gap-0.5">
                <Layers className="h-3 w-3" />
                {totalCards}
              </span>
              {(() => {
                const qCount = questionCountMap ? (() => {
                  const ids = [deck.id];
                  const collectIds = (parentId: string) => {
                    const subs = getSubDecks(parentId);
                    for (const s of subs) { ids.push(s.id); collectIds(s.id); }
                  };
                  collectIds(deck.id);
                  return ids.reduce((sum, id) => sum + (questionCountMap.get(id) ?? 0), 0);
                })() : 0;
                return qCount > 0 ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <HelpCircle className="h-3 w-3" />
                      {qCount}
                    </span>
                  </>
                ) : null;
              })()}
            </p>
          </div>
          {!isErrorDeck && (
            <MasteryBar masteryPct={masteryPct} className="mt-1.5" />
          )}
        </div>

        {/* Actions on hover for loose decks, always when matéria expanded */}
        {!isErrorDeck && !deckSelectionMode && (
          <div className={`flex items-center gap-1.5 shrink-0 transition-opacity duration-200 ${
            hasChildren && isExpanded
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          }`}>
            {hasDueCards && (
              <button
                onClick={(e) => handleStudy(e, deck.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                aria-label="Estudar"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
              </button>
            )}
            <DeckMenu deck={deck} onRename={onRename} onMove={onMove} onArchive={onArchive} onDelete={onDelete} navigate={navigate} />
          </div>
        )}

        {/* Chevron arrow for navigation (loose decks only, hidden on hover) */}
        {!deckSelectionMode && !isErrorDeck && !hasChildren && (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 -rotate-90 group-hover:hidden" />
        )}
      </div>

      {/* Sub-decks (expanded) */}
      {hasChildren && isExpanded && (
        <div className="bg-muted/30">
          {subDecks.map(sub => {
            const subStats = getAggregateStats(sub);
            const subMasteryPct = computeMasteryPct(subStats, sub.total_cards);
            const subHasDue = subStats.new_count + subStats.learning_count + subStats.review_count > 0;
            return (
              <div
                key={sub.id}
                className="group/sub flex items-center gap-3 pl-10 pr-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-t border-border/30"
                onClick={() => navigate(`/decks/${sub.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-foreground truncate">{sub.name}</h4>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                      <Layers className="h-3 w-3" />
                      {sub.total_cards}
                    </span>
                    {questionCountMap && (questionCountMap.get(sub.id) ?? 0) > 0 && (
                      <>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                          <HelpCircle className="h-3 w-3" />
                          {questionCountMap.get(sub.id)}
                        </span>
                      </>
                    )}
                  </div>
                  <MasteryBar masteryPct={subMasteryPct} className="mt-1" />
                </div>
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity duration-200">
                  {subHasDue && (
                    <button
                      onClick={(e) => handleStudy(e, sub.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      aria-label="Estudar"
                    >
                      <Play className="h-3 w-3 fill-current" />
                    </button>
                  )}
                  <DeckMenu deck={sub} onRename={onRename} onMove={onMove} onArchive={onArchive} onDelete={onDelete} navigate={navigate} />
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 -rotate-90 group-hover/sub:hidden" />
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

      {/* Dev modal for non-admin users */}
      <Dialog open={showDevModal} onOpenChange={setShowDevModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              🚧 Em Desenvolvimento
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-3 space-y-3">
              <p>
                O <strong>Caderno de Erros</strong> é uma funcionalidade especial que estamos preparando para você!
              </p>
              <p>Veja como vai funcionar:</p>
              <ul className="list-disc pl-4 space-y-1.5 text-left">
                <li>Quando você errar um cartão (avaliação "De novo"), ele será <strong>automaticamente movido</strong> para o Caderno de Erros.</li>
                <li>Você poderá revisar seus pontos fracos em um só lugar, com foco total na recuperação.</li>
                <li>Quando dominar o cartão (estado "Dominado"), ele <strong>voltará automaticamente</strong> ao deck original.</li>
                <li>Questões erradas em simulados também gerarão cartões de revisão aqui.</li>
              </ul>
              <p className="text-xs text-muted-foreground/70 pt-1">
                Fique ligado — em breve essa funcionalidade estará disponível para todos! 🎉
              </p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
});

DeckRow.displayName = 'DeckRow';

export default DeckRow;
