/**
 * DeckRow — a single deck item in the dashboard list.
 * Shows name, classification bar, hover actions (play/menu), and chevron.
 * Unified template for all decks (with or without sub-decks).
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, HelpCircle, Lock, MoreVertical, Pencil, FolderInput, Archive, Trash2, Settings, Play, GripVertical } from 'lucide-react';
import { IconDeck } from '@/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DeckWithStats } from '@/hooks/useDecks';
import type { DragReorderHandlers } from '@/hooks/useDragReorder';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ERROR_DECK_NAME = '📕 Baralho de Erros';

function getMateriaColor(deckId: string): string | null {
  try {
    const colors = JSON.parse(localStorage.getItem('memo-materia-colors') || '{}');
    return colors[deckId] ?? null;
  } catch { return null; }
}

/**
/**
 * 5-segment classification bar matching the deck detail gauge:
 *  - info/blue: fácil (d ≤ 3)
 *  - success/green: bom (d ≤ 5)
 *  - warning/yellow: difícil (d ≤ 7)
 *  - destructive/red: errei (d > 7)
 *  - muted/gray: novo (state 0)
 */
const ClassificationBar = ({ facilPct, bomPct, dificilPct, erreiPct, novoPct, className = '' }: {
  facilPct: number; bomPct: number; dificilPct: number; erreiPct: number; novoPct: number; className?: string;
}) => (
  <div className={`relative h-1 w-full overflow-hidden rounded-full bg-muted/30 ${className}`}>
    <div className="absolute inset-y-0 left-0 flex w-full">
      {facilPct > 0 && (
        <div className="h-full transition-all duration-500 rounded-l-full" style={{ width: `${facilPct}%`, backgroundColor: 'hsl(var(--info))' }} />
      )}
      {bomPct > 0 && (
        <div className="h-full transition-all duration-500" style={{ width: `${bomPct}%`, backgroundColor: 'hsl(var(--success))' }} />
      )}
      {dificilPct > 0 && (
        <div className="h-full transition-all duration-500" style={{ width: `${dificilPct}%`, backgroundColor: 'hsl(var(--warning))' }} />
      )}
      {erreiPct > 0 && (
        <div className="h-full transition-all duration-500" style={{ width: `${erreiPct}%`, backgroundColor: 'hsl(var(--destructive))' }} />
      )}
      {novoPct > 0 && (
        <div className="h-full bg-muted transition-all duration-500 rounded-r-full" style={{ width: `${novoPct}%` }} />
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
    <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(deck); }}>
        <Pencil className="h-4 w-4 mr-2" /> Renomear
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/decks/${deck.id}/settings`); }}>
        <Settings className="h-4 w-4 mr-2" /> Configurações
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMove(deck); }}>
        <FolderInput className="h-4 w-4 mr-2" /> Mover
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(deck.id); }}>
        <Archive className="h-4 w-4 mr-2" /> Arquivar
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(deck); }} className="text-destructive focus:text-destructive">
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
  onCreateSubDeckAI?: (deckId: string) => void;
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
  /** When true, hides all management actions (menu, play, drag). Used in public/community views. */
  readOnly?: boolean;
  /** When true, hides deck management menu (rename/move/archive/delete) but keeps study actions. */
  disableManagementActions?: boolean;
  /** Navigation state passed when clicking decks in readOnly mode (e.g. { from: 'community', turmaId }) */
  readOnlyNavState?: Record<string, any>;
  /** When true, shows drag handles for reordering */
  organizeMode?: boolean;
}

/** Aggregate 5-segment classification counts across deck + descendants */
function aggregateClassification(deck: DeckWithStats, getSubDecks: (id: string) => DeckWithStats[]) {
  let facil = deck.class_facil ?? 0, bom = deck.class_bom ?? 0, dificil = deck.class_dificil ?? 0, errei = deck.class_errei ?? 0, novo = deck.class_novo ?? 0;
  let total = deck.total_cards;
  const collect = (parentId: string) => {
    const subs = getSubDecks(parentId);
    for (const s of subs) {
      facil += s.class_facil ?? 0; bom += s.class_bom ?? 0; dificil += s.class_dificil ?? 0; errei += s.class_errei ?? 0; novo += s.class_novo ?? 0;
      total += s.total_cards;
      collect(s.id);
    }
  };
  collect(deck.id);
  if (total === 0) return { facilPct: 0, bomPct: 0, dificilPct: 0, erreiPct: 0, novoPct: 0, totalCards: 0 };
  return {
    facilPct: (facil / total) * 100,
    bomPct: (bom / total) * 100,
    dificilPct: (dificil / total) * 100,
    erreiPct: (errei / total) * 100,
    novoPct: (novo / total) * 100,
    totalCards: total,
  };
}


const DeckRow = React.forwardRef<HTMLDivElement, DeckRowProps>(({
  deck, deckSelectionMode, selectedDeckIds,
  toggleDeckSelection, getSubDecks, getAggregateStats,
  onCreateSubDeck, onCreateSubDeckAI,
  onRename, onMove, onArchive, onDelete,
  dragHandlers, hasPendingUpdate,
  expandedAccordionId, onAccordionToggle,
  questionCountMap,
  readOnly = false,
  disableManagementActions = false,
  readOnlyNavState,
  organizeMode = false,
}, ref) => {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const isErrorDeck = deck.name === ERROR_DECK_NAME;
  const [showDevModal, setShowDevModal] = useState(false);

  // Auto-detect linked (followed) decks — hide management actions for community-sourced decks
  const isLinkedDeck = useMemo(() => {
    return !!(deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck);
  }, [deck]);
  const effectiveDisableManagement = disableManagementActions || isLinkedDeck;

  const subDecks = useMemo(() => getSubDecks(deck.id), [deck.id, getSubDecks]);
  const hasChildren = subDecks.length > 0;

  // Aggregate classification across deck + all descendants
  const classPcts = useMemo(() => aggregateClassification(deck, getSubDecks), [deck, getSubDecks]);
  const totalCards = classPcts.totalCards;
  const aggStats = useMemo(() => getAggregateStats(deck), [deck, getAggregateStats]);
  const displayName = isErrorDeck ? 'Baralho de Erros' : deck.name;
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
    // Deck with children → navigate to materia detail page
    if (hasChildren) {
      navigate(`/materia/${deck.id}`);
      return;
    }
    navigate(`/decks/${deck.id}`, readOnlyNavState ? { state: readOnlyNavState } : undefined);
  };

  const handleStudy = (e: React.MouseEvent, deckId: string) => {
    e.stopPropagation();
    navigate(`/decks/${deckId}`, readOnlyNavState ? { state: readOnlyNavState } : undefined);
  };

  return (
    <>
      {/* Unified deck row — same template for all decks */}
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
        {organizeMode && (
          <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 cursor-grab active:cursor-grabbing" />
        )}
        <IconDeck solid={isErrorDeck} className={`h-5 w-5 shrink-0 ${isErrorDeck ? 'text-destructive' : 'text-muted-foreground'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[13px] font-semibold truncate text-foreground">{displayName}</h3>
            {isErrorDeck && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="center" sideOffset={8} className="w-auto max-w-[17rem] rounded-2xl border border-border bg-background px-3 py-2.5 text-xs text-foreground shadow-md" onClick={(e) => e.stopPropagation()}>
                  <p className="leading-relaxed">
                    Errou? Vem pra cá! 🧠 Quando você corrige seus erros, o cérebro grava de verdade. Estude esse baralho pra dominar o que te pega e nunca mais esquecer.
                  </p>
                </PopoverContent>
              </Popover>
            )}
            {hasPendingUpdate && (
              <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-destructive animate-pulse" title="Atualização disponível" />
            )}
          </div>
          {!isErrorDeck && !readOnly && (
            <ClassificationBar
              facilPct={classPcts.facilPct}
              bomPct={classPcts.bomPct}
              dificilPct={classPcts.dificilPct}
              erreiPct={classPcts.erreiPct}
              novoPct={classPcts.novoPct}
              className="mt-1.5"
            />
          )}
        </div>

        {/* Actions on hover */}
        {!isErrorDeck && !deckSelectionMode && !readOnly && (
          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {hasDueCards && (
              <button
                onClick={(e) => handleStudy(e, deck.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                aria-label="Estudar"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
              </button>
            )}
            {!effectiveDisableManagement && (
              <DeckMenu deck={deck} onRename={onRename} onMove={onMove} onArchive={onArchive} onDelete={onDelete} navigate={navigate} />
            )}
          </div>
        )}

        {/* Chevron for navigation */}
        {!deckSelectionMode && !isErrorDeck && (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 -rotate-90 group-hover:hidden" />
        )}
      </div>

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
                O <strong>Baralho de Erros</strong> é uma funcionalidade especial que estamos preparando para você!
              </p>
              <p>Veja como vai funcionar:</p>
              <ul className="list-disc pl-4 space-y-1.5 text-left">
                <li>Quando você errar um cartão (avaliação "De novo"), ele será <strong>automaticamente movido</strong> para o Baralho de Erros.</li>
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

export default React.memo(DeckRow);
