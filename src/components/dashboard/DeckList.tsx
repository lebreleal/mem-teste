/**
 * Renders the list of decks inside a Classe.
 * Supports accordion for sub-decks (only one open at a time).
 * Includes pending (background-generating) decks as ghost items.
 */

import { useState, useMemo } from 'react';
import {
  GraduationCap, ChevronRight, Loader2, Search, Tag as TagIcon, CheckCircle2, XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Progress } from '@/components/ui/progress';
import DeckRow from './DeckRow';
import { usePendingDecks, type PendingDeck } from '@/stores/usePendingDecks';
import { useDragReorder } from '@/hooks/useDragReorder';
import { fetchDeckQuestionCounts } from '@/services/dashboardService';
import type { DeckWithStats } from '@/hooks/useDecks';

const ERROR_DECK_NAME = '📕 Baralho de Erros';

interface DeckListProps {
  isLoading: boolean;
  currentDecks: DeckWithStats[];
  searchQuery?: string;

  // DeckRow props
  deckSelectionMode: boolean;
  selectedDeckIds: Set<string>;
  expandedDecks: Set<string>;
  toggleExpand: (id: string) => void;
  toggleDeckSelection: (id: string) => void;
  getSubDecks: (parentId: string) => DeckWithStats[];
  getAggregateStats: (deck: DeckWithStats) => { new_count: number; learning_count: number; review_count: number; reviewed_today: number };
  getCommunityLinkId: (deck: DeckWithStats) => string | null;
  navigateToCommunity: (id: string) => void;

  // Actions
  onCreateSubDeck: (deckId: string) => void;
  onCreateSubDeckAI?: (deckId: string) => void;
  onRenameDeck: (deck: DeckWithStats) => void;
  onMoveDeck: (deck: DeckWithStats) => void;
  onArchiveDeck: (id: string) => void;
  onDeleteDeck: (deck: DeckWithStats) => void;
  onDetachCommunityDeck?: (deck: DeckWithStats) => void;

  // Reorder callbacks
  onReorderDecks?: (reordered: DeckWithStats[]) => void;

  // Pending updates for community decks
  decksWithPendingUpdates?: Set<string>;

  // Pending deck click handler
  onPendingClick?: (pending: PendingDeck) => void;
  
  // Organize mode
  organizeMode?: boolean;
}

const DeckList = ({
  isLoading, currentDecks, searchQuery = '',
  onRenameDeck, onMoveDeck, onArchiveDeck, onDeleteDeck, onDetachCommunityDeck,
  navigateToCommunity, onReorderDecks,
  decksWithPendingUpdates, onPendingClick,
  organizeMode = false,
  ...deckRowProps
}: DeckListProps) => {
  const { user } = useAuth();
  const { pendingDecks } = usePendingDecks();

  // Fetch question counts per deck via service (Lei 2A compliant)
  const allDeckIdsWithSubs = useMemo(() => {
    const ids = new Set<string>();
    const collect = (parentId: string) => {
      ids.add(parentId);
      const subs = deckRowProps.getSubDecks(parentId);
      for (const s of subs) collect(s.id);
    };
    for (const d of currentDecks) collect(d.id);
    return [...ids];
  }, [currentDecks, deckRowProps.getSubDecks]);

  const { data: questionCountMap } = useQuery({
    queryKey: ['deck-question-counts-list', user?.id, allDeckIdsWithSubs.join(',')],
    queryFn: () => fetchDeckQuestionCounts(allDeckIdsWithSubs),
    enabled: !!user && allDeckIdsWithSubs.length > 0,
    staleTime: 60_000,
  });

  const [expandedAccordionId, setExpandedAccordionId] = useState<string | null>(null);

  const q = searchQuery.toLowerCase();
  // Sort: error deck first, then matérias (decks with sub-decks), then loose decks
  const sortedDecks = useMemo(() => {
    const errorDeck = currentDecks.filter(d => d.name === ERROR_DECK_NAME);
    const rest = currentDecks.filter(d => d.name !== ERROR_DECK_NAME);
    const materias = rest.filter(d => deckRowProps.getSubDecks(d.id).length > 0);
    const loose = rest.filter(d => deckRowProps.getSubDecks(d.id).length === 0);
    return [...errorDeck, ...materias, ...loose];
  }, [currentDecks, deckRowProps.getSubDecks]);
  const filteredDecks = q ? sortedDecks.filter(d => d.name.toLowerCase().includes(q)) : sortedDecks;

  const deckDrag = useDragReorder<DeckWithStats>({
    items: filteredDecks,
    getId: (d) => d.id,
    onReorder: (reordered) => onReorderDecks?.(reordered),
  });

  const visiblePending = q ? [] : pendingDecks.filter(p => !p.folderId);

  const handleAccordionToggle = (deckId: string) => {
    setExpandedAccordionId(prev => prev === deckId ? null : deckId);
  };

  if (isLoading) {
    return (
      <div className="divide-y divide-border/50">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredDecks.length === 0 && visiblePending.length === 0) {
    if (q) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <Search className="h-7 w-7 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum resultado para "{searchQuery}"</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-display text-lg font-bold text-foreground">Nenhum baralho nesta classe</h3>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">Crie seu primeiro baralho para começar a estudar.</p>
        <p className="mt-3 text-xs text-muted-foreground">Use o botão <strong>+</strong> para adicionar</p>
      </div>
    );
  }

  const getPendingStatusLabel = (pending: PendingDeck) => {
    if (pending.status === 'review_ready') return 'Pronto para revisão';
    if (pending.status === 'saving') {
      if (pending.progress.current > 0 && pending.progress.total > 0) {
        return `Salvando... ${pending.progress.current.toLocaleString()} / ${pending.progress.total.toLocaleString()} cartões`;
      }
      return 'Salvando...';
    }
    if (pending.status === 'done') return 'Criando tags...';
    if (pending.status === 'error') return 'Erro — toque para remover';
    return `Gerando lote ${pending.progress.current}/${pending.progress.total}`;
  };

  const getPendingIcon = (pending: PendingDeck) => {
    if (pending.status === 'review_ready') return <CheckCircle2 className="h-5 w-5 text-success animate-in zoom-in-50" />;
    if (pending.status === 'done') return <TagIcon className="h-5 w-5 text-primary animate-pulse" />;
    if (pending.status === 'error') return <XCircle className="h-5 w-5 text-destructive" />;
    return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
  };

  return (
    <div>
      {/* Pending (background generating) decks */}
      {visiblePending.map(pending => {
        const progressPct = pending.progress.total > 0 ? (pending.progress.current / pending.progress.total) * 100 : 0;
        const isClickable = pending.status === 'review_ready' || pending.status === 'error';
        return (
          <div
            key={pending.id}
            className={`flex items-center gap-3 px-5 py-4 transition-colors ${
              isClickable
                ? 'cursor-pointer hover:bg-muted/50'
                : pending.status === 'generating' ? '' : 'opacity-70 select-none'
            } ${pending.status === 'review_ready' ? 'bg-success/5 border-l-2 border-l-success' : ''} ${pending.status === 'error' ? 'bg-destructive/5 border-l-2 border-l-destructive' : ''}`}
            onClick={() => {
              if (pending.status === 'error') { usePendingDecks.getState().removePending(pending.id); return; }
              if (isClickable) onPendingClick?.(pending);
            }}
          >
            <div className="flex h-6 w-6 items-center justify-center shrink-0">
              {getPendingIcon(pending)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-foreground truncate">{pending.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                {pending.status !== 'review_ready' && (
                  <Progress value={progressPct} className="h-1.5 flex-1 max-w-[120px]" />
                )}
                <p className={`text-[10px] ${pending.status === 'review_ready' ? 'text-success font-semibold' : 'text-muted-foreground'}`}>
                  {getPendingStatusLabel(pending)}
                  {pending.status === 'review_ready' && pending.cards && ` · ${pending.cards.length} cartões`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        );
      })}

      {/* Matérias */}
      {deckDrag.displayItems.filter(d => {
        const subs = deckRowProps.getSubDecks(d.id);
        return subs.length > 0 || (d.total_cards === 0 && deckRowProps.expandedDecks.has(d.id));
      }).map(deck => {
        const dragHandlers = deckDrag.getHandlers(deck);
        return (
          <DeckRow
            key={deck.id}
            deck={deck}
            onRename={onRenameDeck}
            onMove={onMoveDeck}
            onArchive={onArchiveDeck}
            onDelete={onDeleteDeck}
            onDetachCommunityDeck={onDetachCommunityDeck}
            navigateToCommunity={navigateToCommunity}
            dragHandlers={dragHandlers}
            hasPendingUpdate={decksWithPendingUpdates instanceof Set ? decksWithPendingUpdates.has(deck.id) : false}
            expandedAccordionId={expandedAccordionId}
            onAccordionToggle={handleAccordionToggle}
            questionCountMap={questionCountMap}
            {...deckRowProps}
          />
        );
      })}

      {/* Spacer between matérias and loose decks */}
      {(() => {
        const hasMaterias = deckDrag.displayItems.some(d => deckRowProps.getSubDecks(d.id).length > 0);
        const hasLoose = deckDrag.displayItems.some(d => {
          const subs = deckRowProps.getSubDecks(d.id);
          const isEmptyMateria = subs.length === 0 && d.total_cards === 0 && deckRowProps.expandedDecks.has(d.id);
          return subs.length === 0 && !isEmptyMateria;
        });
        return hasMaterias && hasLoose ? <div className="h-3" /> : null;
      })()}

      {/* Loose decks */}
      {deckDrag.displayItems.filter(d => {
        const subs = deckRowProps.getSubDecks(d.id);
        const isEmptyMateria = subs.length === 0 && d.total_cards === 0 && deckRowProps.expandedDecks.has(d.id);
        return subs.length === 0 && !isEmptyMateria;
      }).map(deck => {
        const dragHandlers = deckDrag.getHandlers(deck);
        return (
          <DeckRow
            key={deck.id}
            deck={deck}
            onRename={onRenameDeck}
            onMove={onMoveDeck}
            onArchive={onArchiveDeck}
            onDelete={onDeleteDeck}
            onDetachCommunityDeck={onDetachCommunityDeck}
            navigateToCommunity={navigateToCommunity}
            dragHandlers={dragHandlers}
            hasPendingUpdate={decksWithPendingUpdates instanceof Set ? decksWithPendingUpdates.has(deck.id) : false}
            expandedAccordionId={expandedAccordionId}
            onAccordionToggle={handleAccordionToggle}
            questionCountMap={questionCountMap}
            {...deckRowProps}
          />
        );
      })}
    </div>
  );
};

export default DeckList;
