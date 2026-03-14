/**
 * DeckRow — a single deck item in the dashboard list.
 * Shows name, card count, mastery % with progress bar.
 * If the deck has sub-decks, shows an expand/collapse chevron.
 * Special rendering for the "📕 Caderno de Erros" deck.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, ChevronDown, Layers, Lock, Settings, Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { DragReorderHandlers } from '@/hooks/useDragReorder';
import { useIsAdmin } from '@/hooks/useIsAdmin';
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
}


const DeckRow = React.forwardRef<HTMLDivElement, DeckRowProps>(({
  deck, deckSelectionMode, selectedDeckIds,
  toggleDeckSelection, getSubDecks, getAggregateStats,
  dragHandlers, hasPendingUpdate,
  expandedAccordionId, onAccordionToggle,
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
  const { totalCards, masteredCards } = useMemo(() => {
    let total = deck.total_cards;
    let mastered = deck.mastered_cards;
    const collectSubs = (parentId: string) => {
      const subs = getSubDecks(parentId);
      for (const s of subs) {
        total += s.total_cards;
        mastered += s.mastered_cards;
        collectSubs(s.id);
      }
    };
    collectSubs(deck.id);
    return { totalCards: total, masteredCards: mastered };
  }, [deck, getSubDecks]);

  const masteryPct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 1000) / 10 : 0;
  const displayName = isErrorDeck ? 'Caderno de Erros' : deck.name;

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
    // If has children, toggle expand; otherwise navigate
    if (hasChildren) {
      onAccordionToggle?.(deck.id);
    } else {
      navigate(`/decks/${deck.id}`);
    }
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
        {/* Expand/collapse chevron for decks with children */}
        {hasChildren && (
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
          />
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
            {hasChildren && !isErrorDeck && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/decks/${deck.id}/settings`); }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-auto"
                title="Configurações"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground">
              {isErrorDeck
                ? <span>{totalCards} {totalCards === 1 ? 'cartão' : 'cartões'} para revisar</span>
                : hasChildren
                  ? <span>{subDecks.length} {subDecks.length === 1 ? 'deck' : 'decks'} · {totalCards} {totalCards === 1 ? 'cartão' : 'cartões'}</span>
                  : <span>{totalCards} {totalCards === 1 ? 'cartão' : 'cartões'}</span>
              }
            </p>
            <span className="text-xs text-muted-foreground ml-auto">{masteryPct}%</span>
          </div>
          <Progress value={masteryPct} className="h-1 mt-1.5" />
        </div>

        {/* Play button for studying */}
        {!deckSelectionMode && !isErrorDeck && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/study/${deck.id}`);
            }}
            className="shrink-0 h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            title={hasChildren ? 'Estudar todos os decks' : 'Estudar'}
          >
            <Play className="h-4 w-4 ml-0.5" />
          </button>
        )}
      </div>

      {/* Sub-decks (expanded) */}
      {hasChildren && isExpanded && (
        <div className="bg-muted/30">
          {subDecks.map(sub => {
            const subMastery = sub.total_cards > 0 ? Math.round((sub.mastered_cards / sub.total_cards) * 1000) / 10 : 0;
            return (
              <div
                key={sub.id}
                className="flex items-center gap-3 pl-10 pr-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors border-t border-border/30"
                onClick={() => navigate(`/decks/${sub.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground truncate">{sub.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                      <Layers className="h-3 w-3" />
                      {sub.total_cards}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{subMastery}%</span>
                  </div>
                  <Progress value={subMastery} className="h-1 mt-1" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/study/${sub.id}`);
                  }}
                  className="shrink-0 h-8 w-8 rounded-full bg-primary/90 flex items-center justify-center text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                  title="Estudar"
                >
                  <Play className="h-3.5 w-3.5 ml-0.5" />
                </button>
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
