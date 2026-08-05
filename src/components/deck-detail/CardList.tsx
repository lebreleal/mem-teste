/**
 * CardList – renders the card list with search, filter, selection, and progress bar.
 * Uses react-window virtualisation to handle large decks (50k+ cards).
 */

import { useDeckDetail } from './DeckDetailContext';
import { useNavigate } from 'react-router-dom';
import CardPreviewSheet from './CardPreviewSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Search, Plus, Trash2, X, CheckCheck, ArrowUpRight, PenLine, Sparkles, Download, Filter,
  MoreVertical, Eye, Flame, ChevronDown,
  SquareDashed,
  Copy,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import React, { useState, useMemo, useCallback } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { useQuery } from '@tanstack/react-query';
import { fetchCardTagsBatch } from '@/services/dashboardService';

import { shortDisplayId } from '@/lib/shortId';
import { getCardPreview, getCardBackText, getCardStatusBorder } from '@/lib/cardPreview';
import CardThumb from '@/components/cards/CardThumb';
import EmptyDeckState from '@/components/cards/EmptyDeckState';




const PAGE_SIZE_UI = 50;
const GROUP_ROW_HEIGHT = 104;
/** Vertical gap between every card row — identical for all card types. */
const ROW_GAP = 10;

/** Batch-fetch tags for visible card IDs only. */
const useCardTagsBatch = (cardIds: string[]) => {
  const key = cardIds.length > 0 ? cardIds.slice(0, 10).join(',') + ':' + cardIds.length : '';
  return useQuery({
    queryKey: ['tags', 'card-batch', key],
    queryFn: async () => {
      if (cardIds.length === 0) return {} as Record<string, { id: string; name: string; is_official: boolean }[]>;
      return fetchCardTagsBatch(cardIds);
    },
    enabled: cardIds.length > 0,
    staleTime: 60_000,
  });
};

/** Inline tag display using batch data */
const CardTagsInline = React.memo(({ cardId, tagsMap }: { cardId: string; tagsMap: Record<string, { id: string; name: string; is_official: boolean }[]> }) => {
  const tags = tagsMap[cardId];
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map(tag => (
        <Badge key={tag.id} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
          {tag.name}
        </Badge>
      ))}
    </div>
  );
});
CardTagsInline.displayName = 'CardTagsInline';

const CardList = () => {
  const navigate = useNavigate();
  const {
    totalCards, allCards, filteredCards, selectionMode, setSelectionMode,
    selectedCards, setSelectedCards, toggleCardSelection, selectAllCards,
    search, setSearch, typeFilter, setTypeFilter, stateFilter, setStateFilter,
    openEdit, openNew, setDeleteId, handleDuplicateCard, setAiAddCardsOpen, setImportOpen,
    setBulkMoveOpen, setMoveTargetDeck, handleBulkDelete,
    actualNewCount, learningCount, totalReviewStateCards,
    newPct, learningPct, masteredPct,
    isQuickReview, deck, decks,
    getStateInfo, stripHtml, otherDecks, isFrozenCard, unfreezeCard,
    cardCounts, loadMoreCards, hasMoreCards,
  } = useDeckDetail();

  // Check if this deck, any ancestor, or any descendant is linked to a community
  const isLinkedDeck = (() => {
    const isLinked = (d: any) => d?.source_turma_deck_id || d?.source_listing_id || d?.is_live_deck;
    if (isLinked(deck)) return true;
    let parentId = (deck as any)?.parent_deck_id;
    while (parentId) {
      const parent = decks.find((d: any) => d.id === parentId);
      if (!parent) break;
      if (isLinked(parent)) return true;
      parentId = (parent as any).parent_deck_id;
    }
    const hasLinkedDescendant = (id: string): boolean => {
      const children = decks.filter((d: any) => d.parent_deck_id === id);
      return children.some((c: any) => isLinked(c) || hasLinkedDescendant(c.id));
    };
    if (hasLinkedDescendant(deck?.id)) return true;
    return false;
  })();

  const [showFilters, setShowFilters] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_UI);
  const hasActiveFilter = typeFilter !== 'all' || stateFilter !== 'all';

  const frozenCount = cardCounts?.frozen_count ?? 0;
  // relearning count is included in learning_count from RPC (state IN (1,3))
  // We don't have a separate relearning count from the RPC, so we derive from allCards if needed
  const relearningCount = useMemo(() => {
    const fiftyYears = Date.now() + 50 * 365.25 * 24 * 60 * 60 * 1000;
    return allCards.filter(c => c.state === 3 && new Date(c.scheduled_date).getTime() <= fiftyYears).length;
  }, [allCards]);

  // Difficulty-based classification counts (matching Dashboard logic)
  const diffCounts = useMemo(() => {
    let novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0, frozen = 0;
    for (const c of allCards) {
      if (isFrozenCard(c)) { frozen++; continue; }
      if (c.state === 0 || c.state == null) { novo++; continue; }
      const d = c.difficulty ?? 5;
      if (d <= 3) facil++;
      else if (d <= 5) bom++;
      else if (d <= 7) dificil++;
      else errei++;
    }
    return { novo, facil, bom, dificil, errei, frozen };
  }, [allCards, isFrozenCard]);

  const stateOptions = isQuickReview
    ? [
        { value: 'all', label: 'Todos' },
        { value: 'new', label: 'Não estudado' },
        { value: 'learning', label: 'Não entendi' },
        { value: 'mastered', label: 'Entendi' },
        ...(frozenCount > 0 ? [{ value: 'frozen', label: '❄️ Congelados' }] : []),
      ]
    : [
        { value: 'all', label: 'Todos' },
        { value: 'new', label: 'Novos' },
        { value: 'facil', label: 'Fácil' },
        { value: 'bom', label: 'Bom' },
        { value: 'dificil', label: 'Difícil' },
        { value: 'errei', label: 'Errei' },
        ...(frozenCount > 0 ? [{ value: 'frozen', label: '❄️ Congelados' }] : []),
      ];

  const typeOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'basic', label: 'Frente e Verso' },
    { value: 'cloze', label: 'Cloze' },
    { value: 'multiple_choice', label: 'Múltipla' },
    { value: 'image_occlusion', label: 'Oclusão' },
  ].filter(f => {
    if (f.value === 'all') return true;
    if (f.value === 'basic') return (cardCounts?.basic_count ?? 0) > 0;
    if (f.value === 'cloze') return (cardCounts?.cloze_count ?? 0) > 0;
    if (f.value === 'multiple_choice') return (cardCounts?.mc_count ?? 0) > 0;
    if (f.value === 'image_occlusion') return (cardCounts?.occlusion_count ?? 0) > 0;
    return false;
  });

  const getTypeCount = (value: string) => {
    if (!cardCounts) return 0;
    if (value === 'all') return cardCounts.total;
    if (value === 'basic') return cardCounts.basic_count;
    if (value === 'cloze') return cardCounts.cloze_count;
    if (value === 'multiple_choice') return cardCounts.mc_count;
    if (value === 'image_occlusion') return cardCounts.occlusion_count;
    return 0;
  };

  const getStateCount = (value: string) => {
    if (value === 'all') return allCards.length;
    if (value === 'frozen') return diffCounts.frozen;
    if (value === 'new') return diffCounts.novo;
    if (value === 'facil') return diffCounts.facil;
    if (value === 'bom') return diffCounts.bom;
    if (value === 'dificil') return diffCounts.dificil;
    if (value === 'errei') return diffCounts.errei;
    // quickReview fallback
    if (!cardCounts) return 0;
    if (value === 'learning') return cardCounts.learning_count;
    return Math.max(0, cardCounts.total - cardCounts.new_count - cardCounts.learning_count - cardCounts.frozen_count);
  };

  return (
    <>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base sm:text-lg font-bold text-foreground shrink-0">
          Cartões na coleção ({totalCards})
        </h2>
        <div className="flex items-center gap-2">
          {totalCards > 0 && (
            <>
              <Button
                variant={hasActiveFilter ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 relative"
                onClick={() => setShowFilters(!showFilters)}
                title="Filtrar"
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilter && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </Button>
              <Button
                variant={selectionMode ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => { setSelectionMode(!selectionMode); setSelectedCards(new Set()); }}
                title={selectionMode ? 'Cancelar seleção' : 'Selecionar'}
              >
                {selectionMode ? <X className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
              </Button>
            </>
          )}
          {!selectionMode && !isLinkedDeck && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 gap-1.5 px-3 text-xs" title="Adicionar">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Adicionar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/decks/${deck?.id}/manage`)}>
                  <PenLine className="mr-2 h-4 w-4" /> Criar manualmente
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAiAddCardsOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" /> Gerar com IA
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Download className="mr-2 h-4 w-4" /> Importar cartões
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Selection action bar */}
      {selectionMode && selectedCards.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selectedCards.size} selecionado{selectedCards.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => selectAllCards()}>
              <CheckCheck className="h-3.5 w-3.5" /> Desmarcar
            </Button>
            {otherDecks.length > 0 && !isLinkedDeck && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => { setBulkMoveOpen(true); setMoveTargetDeck(''); }}>
                <ArrowUpRight className="h-3.5 w-3.5" /> Mover
              </Button>
            )}
            {!isLinkedDeck && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
          </div>
        </div>
      )}


      {/* Search + Filters */}
      {totalCards > 0 && (
        <div className="space-y-2">
          {totalCards > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Pesquisar cartões" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          )}

          {/* Filter panel */}
          {showFilters && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
              {/* State filter */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  {isQuickReview ? 'Estado (Revisão Rápida)' : 'Classificação'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stateOptions.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStateFilter(s.value)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        stateFilter === s.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-accent border border-border/50'
                      }`}
                    >
                      {s.label} ({getStateCount(s.value)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Type filter */}
              {typeOptions.length > 2 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Tipo de cartão</p>
                  <div className="flex flex-wrap gap-1.5">
                    {typeOptions.map(f => (
                      <button
                        key={f.value}
                        onClick={() => setTypeFilter(f.value)}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          typeFilter === f.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:bg-accent border border-border/50'
                        }`}
                      >
                        {f.label} ({getTypeCount(f.value)})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear filters */}
              {hasActiveFilter && (
                <button
                  onClick={() => { setTypeFilter('all'); setStateFilter('all'); }}
                  className="text-xs text-primary hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card list */}
      {filteredCards.length === 0 ? (
        hasActiveFilter ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
            <h3 className="font-display text-lg font-semibold text-foreground">Nenhum cartão encontrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">Tente ajustar os filtros.</p>
          </div>
        ) : (
          <EmptyDeckState
            onAdd={openNew}
            onAI={() => setAiAddCardsOpen(true)}
            onImport={() => setImportOpen(true)}
          />
        )
      ) : (

        <CardListContent
          filteredCards={filteredCards}
          visibleCount={visibleCount}
          setVisibleCount={setVisibleCount}
          selectionMode={selectionMode}
          selectedCards={selectedCards}
          toggleCardSelection={toggleCardSelection}
          setPreviewIndex={setPreviewIndex}
          getStateInfo={getStateInfo}
          stripHtml={stripHtml}
          isFrozenCard={isFrozenCard}
          unfreezeCard={unfreezeCard}
          openEdit={openEdit}
          setDeleteId={setDeleteId}
          handleDuplicateCard={handleDuplicateCard}
          hasMoreCards={hasMoreCards}
          loadMoreCards={loadMoreCards}
          totalCards={totalCards}
          isLinkedDeck={isLinkedDeck}
          deckId={deck?.id}
        />
      )}
    </div>

    <CardPreviewSheet
      cards={filteredCards}
      initialIndex={previewIndex ?? 0}
      open={previewIndex !== null}
      onClose={() => setPreviewIndex(null)}
    />
  </>
  );
};

/** Extracted to avoid re-running batch tag hook on every parent render */
const CardListContent = ({
  filteredCards, visibleCount, setVisibleCount,
  selectionMode, selectedCards, toggleCardSelection,
  setPreviewIndex, getStateInfo, stripHtml,
  isFrozenCard, unfreezeCard, openEdit, setDeleteId, handleDuplicateCard,
  hasMoreCards, loadMoreCards, totalCards,
  isLinkedDeck, deckId,
}: any) => {
  const [suggestCard, setSuggestCard] = useState<any>(null);
  const [communityWarningOpen, setCommunityWarningOpen] = useState(false);
  // With virtualisation, show all cards — react-window handles DOM efficiency
  const visibleCards = filteredCards;

  // Batch fetch tags only for visible cards
  const visibleCardIds = useMemo(() => visibleCards.map((c: any) => c.id), [visibleCards]);
  const { data: tagsMap = {} } = useCardTagsBatch(visibleCardIds);

  /** Resolve the effective cloze front text for a card (handles cloze stored in back_content extra). */
  const getClozeDisplayText = (card: any): string | null => {
    const hasClozeInFront = /\{\{c\d+::.+?\}\}/.test((card.front_content || '').replace(/<[^>]*>/g, ''));
    if (hasClozeInFront) return card.front_content;
    // Check if back_content JSON extra has cloze markup
    try {
      const parsed = JSON.parse(card.back_content);
      if (parsed && typeof parsed.clozeTarget === 'number' && parsed.extra) {
        const plain = (parsed.extra as string).replace(/<[^>]*>/g, '');
        if (/\{\{c\d+::.+?\}\}/.test(plain)) return parsed.extra;
      }
    } catch {}
    return null;
  };

  const isClozeCard = (c: any) => c.card_type === 'cloze' || getClozeDisplayText(c) !== null;

  // Group siblings that share the same source material so the list shows one
  // stacked entry instead of N near-identical rows:
  //   - cloze cards → same cloze text
  //   - image occlusion cards → same image
  const groups = useMemo(() => {
    const result: { cards: typeof visibleCards; isClozeGroup: boolean }[] = [];
    const usedIds = new Set<string>();
    const occlusionImage = (c: any) => {
      const p = getCardPreview(c.front_content, c.card_type);
      return p.isOcclusion ? p.imageUrl : null;
    };
    visibleCards.forEach((card: any) => {
      if (usedIds.has(card.id)) return;
      if (isClozeCard(card)) {
        const key = getClozeDisplayText(card);
        const siblings = visibleCards.filter(
          (c: any) => isClozeCard(c) && getClozeDisplayText(c) === key && !usedIds.has(c.id)
        );
        siblings.forEach((s: any) => usedIds.add(s.id));
        result.push({ cards: siblings, isClozeGroup: siblings.length > 1 });
        return;
      }
      const img = occlusionImage(card);
      if (img) {
        const siblings = visibleCards.filter(
          (c: any) => !usedIds.has(c.id) && occlusionImage(c) === img
        );
        siblings.forEach((s: any) => usedIds.add(s.id));
        result.push({ cards: siblings, isClozeGroup: siblings.length > 1 });
        return;
      }
      usedIds.add(card.id);
      result.push({ cards: [card], isClozeGroup: false });
    });
    return result;
  }, [visibleCards]);

  const getClozeNumbers = (frontContent: string): number[] => {
    const plain = frontContent.replace(/<[^>]*>/g, '');
    const matches = plain.match(/\{\{c(\d+)::/g) || [];
    const nums = new Set(matches.map(m => parseInt(m.match(/\d+/)![0])));
    return Array.from(nums).sort((a, b) => a - b);
  };
  interface CardListGroupRowProps {
    groups: { cards: any[]; isClozeGroup: boolean }[];
    selectionMode: boolean;
    selectedCards: Set<string>;
    toggleCardSelection: (id: string) => void;
    setPreviewIndex: (idx: number) => void;
    getStateInfo: (card: any) => { label: string; color: string };
    stripHtml: (s: string) => string;
    isFrozenCard: (card: any) => boolean;
    unfreezeCard: (id: string) => void;
    openEdit: (card: any) => void;
    setDeleteId: (id: string | null) => void;
    handleDuplicateCard: (card: any) => void;
    isLinkedDeck: boolean;
    filteredCards: any[];
    tagsMap: Record<string, { id: string; name: string; is_official: boolean }[]>;
    setSuggestCard: (card: any) => void;
    setCommunityWarningOpen: (v: boolean) => void;
    isClozeCard: (card: any) => boolean;
    getClozeDisplayText: (card: any) => string | null;
    getClozeNumbers: (s: string) => number[];
  }

  const groupRowRenderer = useCallback(({ index, style, groups: gs, selectionMode: sm, selectedCards: sc, toggleCardSelection: tcc, setPreviewIndex: spi, getStateInfo: gsi, stripHtml: shtml, isFrozenCard: ifc, unfreezeCard: ufc, openEdit: oe, setDeleteId: sdi, handleDuplicateCard: hdc, isLinkedDeck: ild, filteredCards: fc, tagsMap: tm, setSuggestCard: ssc, setCommunityWarningOpen: scwo, isClozeCard: icc, getClozeDisplayText: gcdt, getClozeNumbers: gcn }: RowComponentProps<CardListGroupRowProps>): React.ReactElement | null => {
    const group = gs[index];
    if (!group) return null;
    const card = group.cards[0];
    const isCloze = icc(card);
    const isMultiple = card.card_type === 'multiple_choice';
    // Never trust card_type alone: legacy occlusion rows were saved with a
    // generic type while storing `{"imageUrl": ...}` JSON, which leaked as raw
    // text in the list. The preview parser normalises both shapes.
    const preview = getCardPreview(card.front_content, card.card_type);
    const isOcclusion = preview.isOcclusion;

    // A grouped entry (same cloze text / same occlusion image) may have its
    // first sibling without a readable front text. Falling back to the first
    // sibling that *does* have text avoids the "empty card" rows.
    const groupPreviewText = preview.text
      || (group.cards
        .map((c: any) => getCardPreview(c.front_content, c.card_type).text)
        .find((t: string) => !!t) ?? '');
    const groupImageUrl = preview.imageUrl
      || (group.cards
        .map((c: any) => getCardPreview(c.front_content, c.card_type).imageUrl)
        .find((u: string | null) => !!u) ?? null);

    const groupBackText = getCardBackText(card)
      || (group.cards.map((c: any) => getCardBackText(c)).find((t: string) => !!t) ?? '');

    const isSelected = sc.has(card.id);
    const frozen = ifc(card);

    // Same colour source as the editor list, so a red card stays red on both.
    const borderColor = getCardStatusBorder(card);


    let mcOptions: string[] = [];
    let mcCorrectIdx = -1;
    if (isMultiple && card.back_content) {
      try {
        const parsed = JSON.parse(card.back_content);
        if (parsed.options) mcOptions = parsed.options;
        if (typeof parsed.correctIndex === 'number') mcCorrectIdx = parsed.correctIndex;
      } catch {}
    }

    const clozeText = isCloze ? gcdt(card) : null;

    return (
      // The row slot has a fixed height; every wrapper below must inherit it
      // (`h-full`) so each card box ends up with the exact same height and the
      // gap between rows is identical for cloze, occlusion and basic cards.
      <div style={{ ...style, paddingBottom: ROW_GAP }}>
        <div className="relative h-full">
          {group.isClozeGroup && (
            <div className="absolute inset-x-1 -bottom-1 h-2 rounded-b-xl border border-t-0 border-border/40 bg-card/50" />
          )}
          <div
            className={`group rounded-xl border border-l-4 ${borderColor} bg-card px-4 py-3 transition-colors cursor-pointer relative h-full overflow-hidden flex items-center ${
              frozen ? 'opacity-50' : ''
            } ${
              // Never override the left border on hover: it carries the card

              // status colour and turning it grey loses that signal.
              isSelected ? 'border-y-primary/50 border-r-primary/50 bg-primary/5' : 'border-y-border/60 border-r-border/60 hover:bg-muted/20 hover:shadow-sm'
            }`}
            onClick={() => {
              if (sm) {
                if (ild) { scwo(true); return; }
                tcc(card.id);
                return;
              }
              const flatIdx = fc.findIndex((c: any) => c.id === card.id);
              spi(flatIdx >= 0 ? flatIdx : 0);
            }}
          >
            <div className="flex w-full items-center gap-3">
              {sm && (
                <div
                  className="pt-0.5 shrink-0"
                  onClick={(e: any) => {
                    e.stopPropagation();
                    if (ild) { scwo(true); return; }
                    tcc(card.id);
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    className={ild ? 'opacity-40 cursor-not-allowed' : ''}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {/* Only cloze cards carry a type chip. Image / occlusion cards
                    are already identified by their own thumbnail, and plain
                    cards stay clean with no icon at all. */}
                {isCloze && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                    <SquareDashed className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide">Cloze</span>
                  </div>
                )}

                {/* One single layout for EVERY card type: optional thumbnail on
                    the left, then a text column where the answer sits directly
                    under the question, left-aligned with it. */}
                <div className="flex items-start gap-2.5">
                  {groupImageUrl && <CardThumb src={groupImageUrl} />}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {isCloze && clozeText
                        ? (() => {
                            const plain = shtml(clozeText);
                            const parts: React.ReactNode[] = [];
                            const regex = /\{\{c(\d+)::([^}]*)\}\}/g;
                            let lastIdx = 0;
                            let m;
                            let k = 0;
                            const BADGE_STYLE = 'bg-primary/15 text-primary border-b-2 border-primary/50 rounded';
                            while ((m = regex.exec(plain)) !== null) {
                              if (m.index > lastIdx) parts.push(<span key={k++}>{plain.slice(lastIdx, m.index)}</span>);
                              const n = parseInt(m[1]);
                              parts.push(
                                <span key={k++} className={`inline-flex items-baseline gap-px px-1 py-0 text-xs font-semibold ${BADGE_STYLE}`}>
                                  <span className="text-[7px] font-bold opacity-50 leading-none" style={{ verticalAlign: 'super' }}>{n}</span>
                                  {m[2]}
                                </span>
                              );
                              lastIdx = m.index + m[0].length;
                            }
                            if (lastIdx < plain.length) parts.push(<span key={k++}>{plain.slice(lastIdx)}</span>);
                            return parts;
                          })()
                        : (groupPreviewText || (groupImageUrl ? '' : 'Sem conteúdo'))}
                    </p>

                    {isMultiple && mcOptions.length > 0 ? (
                      <div className="mt-1 space-y-0.5">
                        {mcOptions.map((opt: string, oi: number) => (
                          <p key={oi} className={`text-xs leading-snug ${oi === mcCorrectIdx ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                            {oi === mcCorrectIdx ? '✓ ' : '  '}{opt}
                          </p>
                        ))}
                      </div>
                    ) : groupBackText ? (
                      <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-1">{groupBackText}</p>
                    ) : null}

                  </div>
                </div>

                <CardTagsInline cardId={card.id} tagsMap={tm} />
              </div>


              <div className="flex items-center gap-1 shrink-0">
                {!sm && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e: any) => e.stopPropagation()}>
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                      <DropdownMenuItem onClick={(e: any) => {
                        e.stopPropagation();
                        const flatIdx = fc.findIndex((c: any) => c.id === card.id);
                        spi(flatIdx >= 0 ? flatIdx : 0);
                      }}>
                        <Eye className="mr-2 h-4 w-4" /> Ver
                      </DropdownMenuItem>
                      {ild ? (
                        <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); ssc(card); }}>
                          <PenLine className="mr-2 h-4 w-4" /> Sugerir Edição
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); oe(card); }}>
                          <PenLine className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                      )}
                      {frozen && (
                        <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); ufc(card.id); }}>
                          <Flame className="mr-2 h-4 w-4" /> Descongelar
                        </DropdownMenuItem>
                      )}
                      {!ild && (
                        <>
                          <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); hdc(card); }}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e: any) => { e.stopPropagation(); sdi(card.id); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }, []);

  const listHeight = Math.min(groups.length * GROUP_ROW_HEIGHT, 700);

  return (
    <>
    <div>
      <List
        rowCount={groups.length}
        rowHeight={GROUP_ROW_HEIGHT}
        style={{ width: '100%', height: listHeight }}
        rowComponent={groupRowRenderer}
        rowProps={{
          groups, selectionMode, selectedCards, toggleCardSelection,
          setPreviewIndex, getStateInfo, stripHtml, isFrozenCard, unfreezeCard,
          openEdit, setDeleteId, handleDuplicateCard, isLinkedDeck, filteredCards, tagsMap,
          setSuggestCard, setCommunityWarningOpen, isClozeCard, getClozeDisplayText, getClozeNumbers,
        }}
        overscanCount={10}
      />

      {/* Load more from server when all loaded cards are shown */}
      {hasMoreCards && (
        <Button
          variant="outline"
          className="w-full gap-2 mt-2.5"
          onClick={loadMoreCards}
        >
          <ChevronDown className="h-4 w-4" />
          Carregar mais cartões ({totalCards - filteredCards.length} restantes)
        </Button>
      )}
    </div>


    {/* Community warning dialog */}
    <Dialog open={communityWarningOpen} onOpenChange={setCommunityWarningOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Conteúdo da comunidade</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cartões vindos da comunidade não podem ser selecionados para mover ou excluir.
          Apenas cartões criados por você podem ser gerenciados.
        </p>
        <DialogFooter>
          <Button onClick={() => setCommunityWarningOpen(false)}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default CardList;
