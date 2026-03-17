/**
 * QuestionFilters — search bar, filter chips, progress bar, and selection action bar.
 * Extracted per Lei 2B from DeckQuestionsTab.tsx (copy-paste integral).
 */
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Filter, CheckCheck, X, Trash2,
  PenLine, Sparkles, Plus, ArrowUpRight,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { QuestionFilter, QuestionStatsData } from '@/components/deck-detail/question-types';

/* ── Header with Add button ── */
export const QuestionHeader = ({
  filteredCount, questionsCount, hasActiveFilter, showFilters, setShowFilters,
  selectionMode, setSelectionMode, setSelectedQuestions,
  isReadOnly, onCreateManual, onCreateAI, onPaste,
}: {
  filteredCount: number;
  questionsCount: number;
  hasActiveFilter: boolean;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  setSelectedQuestions: (v: Set<string>) => void;
  isReadOnly: boolean;
  onCreateManual: () => void;
  onCreateAI: () => void;
  onPaste: () => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <h2 className="font-display text-base sm:text-lg font-bold text-foreground shrink-0">
      Banco de Questões ({filteredCount})
    </h2>
    <div className="flex items-center gap-2">
      {questionsCount > 0 && (
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
            onClick={() => { setSelectionMode(!selectionMode); setSelectedQuestions(new Set()); }}
            title={selectionMode ? 'Cancelar seleção' : 'Selecionar'}
          >
            {selectionMode ? <X className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
          </Button>
        </>
      )}
      {!selectionMode && !isReadOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 gap-1.5 px-3 text-xs" title="Adicionar">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Adicionar</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCreateManual}>
              <PenLine className="mr-2 h-4 w-4" /> Criar manualmente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateAI}>
              <Sparkles className="mr-2 h-4 w-4" /> Gerar com IA
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onPaste}>
              <ArrowUpRight className="mr-2 h-4 w-4" /> Colar questões
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  </div>
);

/* ── Selection action bar ── */
export const SelectionBar = ({
  selectedCount, onDeselect, onBulkDelete, isReadOnly,
}: {
  selectedCount: number;
  onDeselect: () => void;
  onBulkDelete: () => void;
  isReadOnly: boolean;
}) => {
  if (selectedCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selecionada{selectedCount > 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onDeselect}>
          <CheckCheck className="h-3.5 w-3.5" /> Desmarcar
        </Button>
        {!isReadOnly && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-destructive hover:text-destructive"
            onClick={onBulkDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        )}
      </div>
    </div>
  );
};

/* ── Progress bar ── */
export const StatsProgressBar = ({
  statsData, selectionMode,
}: {
  statsData: QuestionStatsData;
  selectionMode: boolean;
}) => {
  if (statsData.total === 0 || selectionMode) return null;
  const correctPct = (statsData.correct / statsData.total) * 100;
  const wrongPct = (statsData.wrong / statsData.total) * 100;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="transition-all" style={{ width: `${correctPct}%`, backgroundColor: 'hsl(var(--success))' }} />
        <div className="transition-all bg-destructive" style={{ width: `${wrongPct}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> <strong className="text-foreground">{statsData.total - statsData.answered}</strong> A responder
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--success))' }} /> <strong className="text-foreground">{statsData.correct}</strong> Corretas
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive" /> <strong className="text-foreground">{statsData.wrong}</strong> Erradas
        </span>
      </div>
    </div>
  );
};

/* ── Search + filter chips ── */
export const SearchAndFilters = ({
  questionsCount, searchQuery, setSearchQuery,
  showFilters, filter, setFilter, statsData, hasActiveFilter,
}: {
  questionsCount: number;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  showFilters: boolean;
  filter: QuestionFilter;
  setFilter: (v: QuestionFilter) => void;
  statsData: QuestionStatsData;
  hasActiveFilter: boolean;
}) => {
  if (questionsCount === 0) return null;
  return (
    <div className="space-y-2">
      {questionsCount > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar questões..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      )}

      {showFilters && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'all' as const, label: 'Todas', count: statsData.total },
                { key: 'unanswered' as const, label: 'A responder', count: statsData.total - statsData.answered },
                { key: 'correct' as const, label: 'Corretas', count: statsData.correct },
                { key: 'errors' as const, label: 'Erradas', count: statsData.wrong },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-accent border border-border/50'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          </div>
          {hasActiveFilter && (
            <button onClick={() => setFilter('all')} className="text-xs text-primary hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
};
