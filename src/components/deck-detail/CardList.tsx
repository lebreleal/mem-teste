/**
 * CardList – renders the card list with search, filter, selection, and progress bar.
 */

import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search, Plus, Trash2, X, CheckCheck, ArrowUpRight, PenLine, Sparkles, Download, Filter,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

const CardList = () => {
  const {
    totalCards, allCards, filteredCards, selectionMode, setSelectionMode,
    selectedCards, setSelectedCards, toggleCardSelection, selectAllCards,
    search, setSearch, typeFilter, setTypeFilter, stateFilter, setStateFilter,
    openEdit, openNew, setDeleteId, setAiAddCardsOpen, setImportOpen,
    setBulkMoveOpen, setMoveTargetDeck, handleBulkDelete,
    actualNewCount, learningCount, totalReviewStateCards,
    newPct, learningPct, masteredPct,
    isQuickReview, deck, decks,
    getStateInfo, stripHtml, otherDecks,
  } = useDeckDetail();

  // Check if this deck, any ancestor, or any descendant is linked to a community
  const isLinkedDeck = (() => {
    if ((deck as any)?.source_turma_deck_id) return true;
    // Check ancestors
    let parentId = (deck as any)?.parent_deck_id;
    while (parentId) {
      const parent = decks.find((d: any) => d.id === parentId);
      if (!parent) break;
      if ((parent as any).source_turma_deck_id) return true;
      parentId = (parent as any).parent_deck_id;
    }
    // Check descendants
    const hasLinkedDescendant = (id: string): boolean => {
      const children = decks.filter((d: any) => d.parent_deck_id === id);
      return children.some((c: any) => c.source_turma_deck_id || hasLinkedDescendant(c.id));
    };
    if (hasLinkedDescendant(deck?.id)) return true;
    return false;
  })();

  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilter = typeFilter !== 'all' || stateFilter !== 'all';

  const stateOptions = isQuickReview
    ? [
        { value: 'all', label: 'Todos' },
        { value: 'new', label: 'Não estudado' },
        { value: 'learning', label: 'Não entendi' },
        { value: 'mastered', label: 'Entendi' },
      ]
    : [
        { value: 'all', label: 'Todos' },
        { value: 'new', label: 'Novos' },
        { value: 'learning', label: 'Em andamento' },
        { value: 'mastered', label: 'Dominados' },
      ];

  const typeOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'basic', label: 'Frente e Verso' },
    { value: 'cloze', label: 'Cloze' },
    { value: 'multiple_choice', label: 'Múltipla' },
    { value: 'image_occlusion', label: 'Oclusão' },
  ].filter(f => {
    if (f.value === 'all') return true;
    return allCards.some(c => f.value === 'basic' ? (c.card_type === 'basic' || !c.card_type) : c.card_type === f.value);
  });

  const getTypeCount = (value: string) => {
    if (value === 'all') return allCards.length;
    return allCards.filter(c => value === 'basic' ? (c.card_type === 'basic' || !c.card_type) : c.card_type === value).length;
  };

  const getStateCount = (value: string) => {
    if (value === 'all') return allCards.length;
    if (value === 'new') return allCards.filter(c => c.state === 0).length;
    if (value === 'learning') return allCards.filter(c => c.state === 1).length;
    return allCards.filter(c => c.state >= 2).length;
  };

  return (
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
                <Button size="icon" className="h-8 w-8" title="Adicionar">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openNew()}>
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
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          </div>
        </div>
      )}

      {/* Progress bar – hidden in quick review mode */}
      {totalCards > 0 && !selectionMode && !isQuickReview && (
        <div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-muted-foreground/30 transition-all" style={{ width: `${newPct}%` }} />
            <div className="bg-green-500 transition-all" style={{ width: `${learningPct}%` }} />
            <div className="bg-primary transition-all" style={{ width: `${masteredPct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> <strong className="text-foreground">{actualNewCount}</strong> Não estudados
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> <strong className="text-foreground">{learningCount}</strong> Em andamento
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" /> <strong className="text-foreground">{totalReviewStateCards}</strong> Dominados
            </span>
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
                  {isQuickReview ? 'Estado (Revisão Rápida)' : 'Estado de aprendizagem'}
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
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <h3 className="font-display text-lg font-semibold text-foreground">
            {hasActiveFilter ? 'Nenhum cartão encontrado' : 'Nenhum cartão ainda'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilter ? 'Tente ajustar os filtros.' : 'Adicione flashcards para começar a estudar.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredCards.map(card => {
            const isCloze = card.card_type === 'cloze';
            const isMultiple = card.card_type === 'multiple_choice';
            const isOcclusion = card.card_type === 'image_occlusion';
            const isSelected = selectedCards.has(card.id);

            const typeLabel = isCloze ? 'CLOZE' : isMultiple ? 'MÚLTIPLA' : isOcclusion ? 'OCLUSÃO' : 'BÁSICO';
            const typeBadgeClass = isCloze
              ? 'bg-primary/15 text-primary border-primary/30'
              : isMultiple
              ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
              : isOcclusion
              ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400'
              : 'bg-muted text-muted-foreground border-border';

            // Parse multiple choice options from back_content
            let mcOptions: string[] = [];
            let mcCorrectIdx = -1;
            if (isMultiple && card.back_content) {
              try {
                const parsed = JSON.parse(card.back_content);
                if (parsed.options) mcOptions = parsed.options;
                if (typeof parsed.correctIndex === 'number') mcCorrectIdx = parsed.correctIndex;
              } catch {
                // not JSON, just show as text
              }
            }

            return (
              <div
                key={card.id}
                className={`group rounded-xl border bg-card p-4 transition-colors cursor-pointer ${
                  isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/60 hover:border-border hover:shadow-sm'
                }`}
                onClick={() => selectionMode ? toggleCardSelection(card.id) : openEdit(card)}
              >
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <div className="pt-0.5 shrink-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCardSelection(card.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const stateInfo = getStateInfo(card);
                      return (
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateInfo.color}`}>
                            {stateInfo.label}
                          </span>
                          {card.state >= 2 && card.scheduled_date && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(card.scheduled_date) <= new Date() ? 'Revisão agora' : `Próx: ${new Date(card.scheduled_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      {stripHtml(card.front_content)}
                    </p>

                    {/* Multiple choice options */}
                    {isMultiple && mcOptions.length > 0 ? (
                      <div className="mt-2 space-y-0.5">
                        {mcOptions.map((opt, oi) => (
                          <p key={oi} className={`text-xs leading-snug ${oi === mcCorrectIdx ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                            {oi === mcCorrectIdx ? '✓ ' : '  '}{opt}
                          </p>
                        ))}
                      </div>
                    ) : !isOcclusion && card.back_content ? (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-snug line-clamp-2">
                        {stripHtml(card.back_content)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass}`}>
                      {typeLabel}
                    </span>
                    {!selectionMode && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(card); }}>
                          <PenLine className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(card.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CardList;
