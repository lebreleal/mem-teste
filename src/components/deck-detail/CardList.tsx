/**
 * CardList – renders the card list with search, filter, selection, and progress bar.
 */

import { useDeckDetail } from './DeckDetailContext';
import CardPreviewSheet from './CardPreviewSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Search, Plus, Trash2, X, CheckCheck, ArrowUpRight, PenLine, Sparkles, Download, Filter,
  MoreVertical, Eye, Flame,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';
import { useCardTags } from '@/hooks/useTags';

/** Inline tag display for card list items */
const CardTagsInline = ({ cardId }: { cardId: string }) => {
  const { data: tags = [] } = useCardTags(cardId);
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map(tag => (
        <Badge key={tag.id} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
          {tag.name}
        </Badge>
      ))}
    </div>
  );
};

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
    getStateInfo, stripHtml, otherDecks, isFrozenCard, unfreezeCard,
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const hasActiveFilter = typeFilter !== 'all' || stateFilter !== 'all';

  const frozenCount = allCards.filter(c => isFrozenCard(c)).length;

  const relearningCount = allCards.filter(c => c.state === 3 && !isFrozenCard(c)).length;

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
        { value: 'learning', label: 'Aprendendo' },
        ...(relearningCount > 0 ? [{ value: 'relearning', label: 'Reaprendendo' }] : []),
        { value: 'mastered', label: 'Dominados' },
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
    return allCards.some(c => f.value === 'basic' ? (c.card_type === 'basic' || !c.card_type) : c.card_type === f.value);
  });

  const getTypeCount = (value: string) => {
    if (value === 'all') return allCards.length;
    return allCards.filter(c => value === 'basic' ? (c.card_type === 'basic' || !c.card_type) : c.card_type === value).length;
  };

  const getStateCount = (value: string) => {
    if (value === 'all') return allCards.length;
    if (value === 'frozen') return frozenCount;
    if (value === 'new') return allCards.filter(c => (c.state === 0 || c.state == null) && !isFrozenCard(c)).length;
    if (value === 'learning') return allCards.filter(c => c.state === 1 && !isFrozenCard(c)).length;
    if (value === 'relearning') return allCards.filter(c => c.state === 3 && !isFrozenCard(c)).length;
    return allCards.filter(c => c.state === 2 && !isFrozenCard(c)).length;
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
            <div className="transition-all" style={{ width: `${learningPct}%`, backgroundColor: '#47c700' }} />
            <div className="bg-primary transition-all" style={{ width: `${masteredPct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> <strong className="text-foreground">{actualNewCount}</strong> Novos
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#47c700' }} /> <strong className="text-foreground">{learningCount}</strong> Aprendendo
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
          {(() => {
            // Group cloze cards by front_content to show as stacked
            const groups: { cards: typeof filteredCards; isClozeGroup: boolean }[] = [];
            const usedIds = new Set<string>();

            const isClozeCard = (c: typeof filteredCards[0]) => c.card_type === 'cloze' || /\{\{c\d+::.+?\}\}/.test(c.front_content);
            filteredCards.forEach(card => {
              if (usedIds.has(card.id)) return;
              if (isClozeCard(card)) {
                // Find all cloze cards with same front_content
                const siblings = filteredCards.filter(
                  c => isClozeCard(c) && c.front_content === card.front_content && !usedIds.has(c.id)
                );
                siblings.forEach(s => usedIds.add(s.id));
                groups.push({ cards: siblings, isClozeGroup: siblings.length > 1 });
              } else {
                usedIds.add(card.id);
                groups.push({ cards: [card], isClozeGroup: false });
              }
            });

            // Extract cloze numbers from front content
            const getClozeNumbers = (frontContent: string): number[] => {
              const plain = frontContent.replace(/<[^>]*>/g, '');
              const matches = plain.match(/\{\{c(\d+)::/g) || [];
              const nums = new Set(matches.map(m => parseInt(m.match(/\d+/)![0])));
              return Array.from(nums).sort((a, b) => a - b);
            };

            

            return groups.map((group, gi) => {
               const card = group.cards[0];
               const isCloze = card.card_type === 'cloze' || /\{\{c\d+::.+?\}\}/.test(card.front_content);
               const isMultiple = card.card_type === 'multiple_choice';
               const isOcclusion = card.card_type === 'image_occlusion';
               const isSelected = selectedCards.has(card.id);
               const frozen = isFrozenCard(card);

                  const typeLabel = isCloze ? 'CLOZE' : isMultiple ? 'MÚLTIPLA' : isOcclusion ? 'OCLUSÃO' : 'BÁSICO';
                  const typeBadgeClass = isCloze
                ? 'bg-primary/15 text-primary border-primary/30'
                : isMultiple
                ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
                : isOcclusion
                ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400'
                : 'bg-muted text-muted-foreground border-border';

              // Parse multiple choice options
              let mcOptions: string[] = [];
              let mcCorrectIdx = -1;
              if (isMultiple && card.back_content) {
                try {
                  const parsed = JSON.parse(card.back_content);
                  if (parsed.options) mcOptions = parsed.options;
                  if (typeof parsed.correctIndex === 'number') mcCorrectIdx = parsed.correctIndex;
                } catch {}
              }

              const clozeNums = isCloze ? getClozeNumbers(card.front_content) : [];

              return (
                <div key={card.id} className="relative">
                  {/* Stacked card effect for multi-cloze */}
                  {group.isClozeGroup && (
                    <div className="absolute inset-x-1 -bottom-1 h-2 rounded-b-xl border border-t-0 border-border/40 bg-card/50" />
                  )}
                  <div
                    className={`group rounded-xl border bg-card p-4 transition-colors cursor-pointer relative ${
                      frozen ? 'opacity-50' : ''
                    } ${
                      isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/60 hover:border-border hover:shadow-sm'
                    }`}
                    onClick={() => {
                      if (selectionMode) { toggleCardSelection(card.id); return; }
                      // Find the flat index of this card in filteredCards
                      const flatIdx = filteredCards.findIndex(c => c.id === card.id);
                      setPreviewIndex(flatIdx >= 0 ? flatIdx : 0);
                    }}
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
                        {isCloze ? (
                          <p className="text-sm font-semibold text-foreground leading-snug">
                            {(() => {
                              const plain = stripHtml(card.front_content);
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
                            })()}
                          </p>
                        ) : isOcclusion ? (
                          (() => {
                            try {
                              const data = JSON.parse(card.front_content);
                              const rectCount = data.allRects?.length || 0;
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="h-10 w-14 rounded border border-border/50 bg-muted/50 overflow-hidden shrink-0">
                                    {data.imageUrl && (
                                      <img src={data.imageUrl} alt="" className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{rectCount} área{rectCount !== 1 ? 's' : ''} oculta{rectCount !== 1 ? 's' : ''}</span>
                                </div>
                              );
                            } catch {
                              return <p className="text-sm text-muted-foreground">Oclusão de imagem</p>;
                            }
                          })()
                        ) : (
                          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                            {stripHtml(card.front_content)}
                          </p>
                        )}


                        {/* Multiple choice options */}
                        {isMultiple && mcOptions.length > 0 ? (
                          <div className="mt-2 space-y-0.5">
                            {mcOptions.map((opt, oi) => (
                              <p key={oi} className={`text-xs leading-snug ${oi === mcCorrectIdx ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                                {oi === mcCorrectIdx ? '✓ ' : '  '}{opt}
                              </p>
                            ))}
                          </div>
                        ) : !isOcclusion && !isCloze && card.back_content ? (
                          <p className="text-xs text-muted-foreground mt-1.5 leading-snug line-clamp-2">
                            {stripHtml(card.back_content)}
                          </p>
                        ) : null}

                        <CardTagsInline cardId={card.id} />
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass}`}>
                          {isCloze && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                              <path fillRule="evenodd" d="M3 17.25V19a2 2 0 0 0 2 2h1.75v-2H5v-1.75zm0-3.5h2v-3.5H3zm0-7h2V5h1.75V3H5a2 2 0 0 0-2 2zM10.25 3v2h3.5V3zm7 0v2H19v1.75h2V5a2 2 0 0 0-2-2zM21 10.25h-2v3.5h2zm0 7h-2V19h-1.75v2H19a2 2 0 0 0 2-2zM13.75 21v-2h-3.5v2z" clipRule="evenodd" />
                            </svg>
                          )}
                          {typeLabel}
                        </span>
                        {!selectionMode && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[140px]">
                              <DropdownMenuItem onClick={e => {
                                e.stopPropagation();
                                const flatIdx = filteredCards.findIndex(c => c.id === card.id);
                                setPreviewIndex(flatIdx >= 0 ? flatIdx : 0);
                              }}>
                                <Eye className="mr-2 h-4 w-4" /> Ver
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); openEdit(card); }}>
                                <PenLine className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              {frozen && (
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); unfreezeCard(card.id); }}>
                                  <Flame className="mr-2 h-4 w-4" /> Descongelar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(card.id); }}>
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
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

export default CardList;
