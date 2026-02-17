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
    isQuickReview, deck,
    getStateInfo, stripHtml, otherDecks,
  } = useDeckDetail();

  const isLinkedDeck = !!(deck as any)?.source_turma_deck_id;

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
            {otherDecks.length > 0 && (
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
        <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
          {filteredCards.map(card => {
            const stateInfo = getStateInfo(card);
            const isCloze = card.card_type === 'cloze';
            const isOcclusion = card.card_type === 'image_occlusion';
            const isSelected = selectedCards.has(card.id);
            return (
              <div
                key={card.id}
                className={`group px-4 py-3 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'}`}
                onClick={() => selectionMode ? toggleCardSelection(card.id) : openEdit(card)}
              >
                <div className="flex items-start justify-between gap-3">
                  {selectionMode && (
                    <div className="pt-1 shrink-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleCardSelection(card.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stateInfo.color}`}>
                        {stateInfo.label}
                      </span>
                      {isCloze && <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Cloze</span>}
                      {isOcclusion && <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Oclusão</span>}
                    </div>
                    <p className="text-sm font-medium text-card-foreground line-clamp-1">{stripHtml(card.front_content)}</p>
                    {!isOcclusion && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{stripHtml(card.back_content)}</p>}
                  </div>
                  {!selectionMode && (
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(card.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
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
