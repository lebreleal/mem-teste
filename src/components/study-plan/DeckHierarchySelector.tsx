/**
 * Extracted from StudyPlan page:
 * - DeckHierarchySelector: tree-view deck picker with checkboxes
 * - ObjectiveDecksExpanded: draggable deck list inside an expanded objective
 */

import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { DeckWithStats } from '@/types/deck';
import type { StudyPlan as StudyPlanType } from '@/hooks/useStudyPlan';
import { useDragReorder } from '@/hooks/useDragReorder';
import { CompactDeckRow } from './PlanComponents';
import type { useStudyPlan } from '@/hooks/useStudyPlan';

// ─── Deck Hierarchy Selector ────────────────────────────
export function DeckHierarchySelector({
  decks, selectedDeckIds, setSelectedDeckIds, plans, editingPlanId,
}: {
  decks: DeckWithStats[];
  selectedDeckIds: string[];
  setSelectedDeckIds: React.Dispatch<React.SetStateAction<string[]>>;
  plans: StudyPlanType[];
  editingPlanId: string | null;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const rootDecks = useMemo(() => decks.filter(d => !d.parent_deck_id), [decks]);
  const getChildren = useCallback((parentId: string) => decks.filter(d => d.parent_deck_id === parentId), [decks]);

  const getOwnCards = useCallback((deck: DeckWithStats): number => {
    return deck.new_count + deck.learning_count + deck.review_count + deck.reviewed_today;
  }, []);

  const getDescendantCards = useCallback((deck: DeckWithStats): number => {
    const children = getChildren(deck.id);
    return children.reduce((sum, c) => sum + getOwnCards(c) + getDescendantCards(c), 0);
  }, [getChildren, getOwnCards]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const collectAllDescendants = (parentId: string): string[] => {
    const children = getChildren(parentId);
    return children.flatMap(c => [c.id, ...collectAllDescendants(c.id)]);
  };

  const handleToggle = (deckId: string, checked: boolean) => {
    if (checked) {
      setSelectedDeckIds(prev => [...new Set([...prev, deckId])]);
    } else {
      setSelectedDeckIds(prev => prev.filter(id => id !== deckId));
    }
  };

  const handleToggleWithDescendants = (deckId: string, checked: boolean) => {
    const descendantIds = collectAllDescendants(deckId);
    if (checked) {
      setSelectedDeckIds(prev => [...new Set([...prev, deckId, ...descendantIds])]);
      setExpandedIds(prev => { const next = new Set(prev); next.add(deckId); return next; });
    } else {
      const toRemove = new Set([deckId, ...descendantIds]);
      setSelectedDeckIds(prev => prev.filter(id => !toRemove.has(id)));
    }
  };

  const renderDeck = (deck: DeckWithStats, depth: number) => {
    const children = getChildren(deck.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(deck.id);
    const isSelected = selectedDeckIds.includes(deck.id);
    const ownCards = getOwnCards(deck);
    const descendantCards = getDescendantCards(deck);
    const totalCards = ownCards + descendantCards;
    const otherPlans = plans.filter(p => p.id !== editingPlanId && (p.deck_ids ?? []).includes(deck.id));

    const allDescendants = hasChildren ? collectAllDescendants(deck.id) : [];
    const allDescendantsSelected = hasChildren && allDescendants.length > 0 && allDescendants.every(id => selectedDeckIds.includes(id));

    return (
      <div key={deck.id}>
        <label
          className={cn(
            'flex items-center gap-2 py-2.5 px-3 rounded-lg cursor-pointer transition-all group',
            isSelected
              ? 'bg-primary/8 border border-primary/20'
              : 'hover:bg-muted/50 border border-transparent',
          )}
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpand(deck.id); }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-200', isExpanded && 'rotate-90')} />
            </button>
          ) : depth > 0 ? (
            <span className="w-5 shrink-0 flex items-center justify-center">
              <span className="h-px w-3 bg-border/60" />
            </span>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => handleToggle(deck.id, !!checked)}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className={cn(
                'text-sm truncate',
                depth === 0 ? 'font-semibold' : 'font-medium text-muted-foreground',
              )}>{deck.name}</p>
            </div>
            {otherPlans.length > 0 && (
              <p className="text-[9px] text-primary/60 truncate">
                Compartilhado: {otherPlans.map(p => p.name).join(', ')}
              </p>
            )}
          </div>

          <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums shrink-0">
            <Layers className="h-3 w-3" />
            {hasChildren && isExpanded ? (
              <>{ownCards} <span className="text-[10px]">cards próprios</span></>
            ) : (
              <>{hasChildren ? totalCards : ownCards}</>
            )}
          </span>
        </label>

        {hasChildren && isExpanded && (
          <div className="relative">
            <div className="absolute top-0 bottom-0" style={{ left: `${20 + depth * 24}px` }}>
              <div className="w-px h-full bg-border/40" />
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-[10px] text-primary hover:text-primary/80 font-medium py-1 transition-colors"
              style={{ paddingLeft: `${36 + depth * 24}px` }}
              onClick={() => {
                const allSelected = isSelected && allDescendantsSelected;
                handleToggleWithDescendants(deck.id, !allSelected);
              }}
            >
              {isSelected && allDescendantsSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              <span className="text-muted-foreground font-normal">({totalCards} cards)</span>
            </button>
            {children.map(child => renderDeck(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {selectedDeckIds.length} selecionado{selectedDeckIds.length !== 1 ? 's' : ''}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs h-6 px-2"
          onClick={() => {
            if (selectedDeckIds.length === decks.length) {
              setSelectedDeckIds([]);
            } else {
              setSelectedDeckIds(decks.map(d => d.id));
            }
          }}
        >
          {selectedDeckIds.length === decks.length ? 'Limpar' : 'Todos'}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-2 space-y-0.5">
        {rootDecks.map(deck => renderDeck(deck, 0))}
        {rootDecks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum baralho encontrado</p>
        )}
      </div>
    </div>
  );
}

// ─── Objective Decks Expanded (with drag reorder) ───────
export function ObjectiveDecksExpanded({ plan, activeDecks, avgSecondsPerCard, updatePlan }: {
  plan: StudyPlanType;
  activeDecks: DeckWithStats[];
  avgSecondsPerCard: number;
  updatePlan: ReturnType<typeof useStudyPlan>['updatePlan'];
}) {
  const deckItems = useMemo(() =>
    (plan.deck_ids ?? [])
      .map(id => activeDecks.find(d => d.id === id))
      .filter((d): d is DeckWithStats => !!d),
    [plan.deck_ids, activeDecks]
  );

  const { getHandlers, displayItems } = useDragReorder({
    items: deckItems,
    getId: (d) => d.id,
    onReorder: (reordered) => {
      updatePlan.mutateAsync({ id: plan.id, deck_ids: reordered.map(d => d.id) });
    },
  });

  return (
    <>
      {displayItems.map(deck => {
        const handlers = getHandlers(deck);
        return (
          <div key={deck.id} {...handlers} className={handlers.className}>
            <CompactDeckRow deck={deck} avgSecondsPerCard={avgSecondsPerCard} showGrip={true} />
          </div>
        );
      })}
      {deckItems.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum baralho associado</p>
      )}
    </>
  );
}
