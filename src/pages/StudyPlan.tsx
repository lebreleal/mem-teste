import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Clock, Target, CalendarIcon, Plus, GripVertical,
  ChevronDown, ChevronUp, Pencil, Brain, RotateCcw, Crown, Trash2,
  ChevronRight, Layers, Sparkles, HelpCircle, Info, FolderTree,
  Library, GraduationCap, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import {
  useStudyPlan, getMinutesForDayGlobal, getWeeklyAvgMinutesGlobal, getWeeklyAvgNewCardsGlobal,
  DAY_LABELS, type StudyPlan as StudyPlanType, type DayKey, type WeeklyMinutes, type WeeklyNewCards,
} from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import type { DeckWithStats } from '@/types/deck';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { useDragReorder } from '@/hooks/useDragReorder';
import { HealthRing, StudyLoadBar, ForecastSimulator, CompactDeckRow } from '@/components/study-plan/PlanComponents';
import { useForecastSimulator, useForecastView } from '@/hooks/useForecastSimulator';
import type { ForecastView } from '@/types/forecast';
import { formatMinutes, SLIDER_MARKS, HEALTH_CONFIG, HERO_GRADIENT } from '@/components/study-plan/constants';
import BottomNav from '@/components/BottomNav';

type WizardStep = 1 | 2 | 3;

// ─── Objective Health Helper ────────────────────────────
function getObjectiveHealth(p: StudyPlanType): 'green' | 'yellow' | 'orange' | 'red' {
  if (!p.target_date) return 'green';
  const target = new Date(p.target_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
  if (daysLeft <= 0) return 'red';
  if (daysLeft <= 7) return 'orange';
  if (daysLeft <= 30) return 'yellow';
  return 'green';
}

// ─── "What Can I Do?" Dialog ────────────────────────────
function WhatCanIDoDialog({ open, onOpenChange, totalNew, neededPerDay, budget, suggestedDate, earliestTarget, avgDailyMin, reviewMinToday, avgSec, effectiveRate, onApplyDate, onGoToCards, onGoToCapacity }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  totalNew: number; neededPerDay: number; budget: number;
  suggestedDate: Date; earliestTarget: Date;
  avgDailyMin: number; reviewMinToday: number; avgSec: number; effectiveRate: number;
  onApplyDate: (date: Date) => void;
  onGoToCards: () => void;
  onGoToCapacity: () => void;
}) {
  const neededMinPerDay = Math.ceil((neededPerDay * avgSec) / 60) + reviewMinToday;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            O que posso fazer?
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Você tem <strong>{totalNew} cards novos</strong> para dominar até <strong>{format(earliestTarget, "dd/MM/yyyy")}</strong>, mas no ritmo atual ({effectiveRate}/dia) só terminaria em <strong>{format(suggestedDate, "dd/MM/yyyy")}</strong>. Veja suas opções:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Option 1: Change date */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold">Dar mais tempo</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mudar a data pra completar o estudo para <strong>{format(suggestedDate, "dd/MM/yyyy")}</strong> — assim você mantém o ritmo atual sem se sobrecarregar.
            </p>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { onApplyDate(suggestedDate); onOpenChange(false); }}>
              <CalendarIcon className="h-3 w-3 mr-1.5" />
              Aplicar data sugerida
            </Button>
          </div>

          {/* Option 2: Increase cards */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold">Estudar mais cards por dia</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aumentar de <strong>{budget}</strong> para <strong>{neededPerDay} novos cards/dia</strong> para cumprir o prazo.
            </p>
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { onGoToCards(); onOpenChange(false); }}>
              <Layers className="h-3 w-3 mr-1.5" />
              Ajustar limite de cards
            </Button>
          </div>

          {/* Option 3: Increase time – removed per user request */}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catch-Up Dialog ────────────────────────────────────
function CatchUpDialog({ open, onOpenChange, totalReview, avgSecondsPerCard, allDeckIds }: {
  open: boolean; onOpenChange: (v: boolean) => void; totalReview: number; avgSecondsPerCard: number; allDeckIds: string[];
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);

  // Count severely overdue cards (>30 days) when dialog opens
  useEffect(() => {
    if (!open || allDeckIds.length === 0) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .in('deck_id', allDeckIds)
      .eq('state', 2)
      .lt('scheduled_date', cutoff.toISOString())
      .then(({ count }) => setOverdueCount(count ?? 0));
  }, [open, allDeckIds]);

  const [diluting, setDiluting] = useState(false);

  const handleDilute = async (days: number) => {
    if (allDeckIds.length === 0) return;
    setDiluting(true);

    // Fetch all overdue review cards for the plan's decks
    const { data: overdueCards, error: fetchErr } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', allDeckIds)
      .eq('state', 2)
      .lte('scheduled_date', new Date().toISOString())
      .order('scheduled_date', { ascending: true });

    if (fetchErr || !overdueCards || overdueCards.length === 0) {
      setDiluting(false);
      onOpenChange(false);
      if (fetchErr) toast({ title: 'Erro ao buscar cards', variant: 'destructive' });
      return;
    }

    // Distribute cards across `days` days, starting today
    const perDay = Math.ceil(overdueCards.length / days);
    let hasError = false;

    for (let d = 0; d < days && !hasError; d++) {
      const batch = overdueCards.slice(d * perDay, (d + 1) * perDay);
      if (batch.length === 0) break;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + d);
      targetDate.setHours(0, 0, 0, 0);

      const { error: upErr } = await supabase
        .from('cards')
        .update({ scheduled_date: targetDate.toISOString() } as any)
        .in('id', batch.map(c => c.id));

      if (upErr) hasError = true;
    }

    setDiluting(false);
    onOpenChange(false);

    if (hasError) {
      toast({ title: 'Erro ao redistribuir alguns cards', variant: 'destructive' });
    } else {
      const minPerDay = Math.round((perDay * avgSecondsPerCard) / 60);
      toast({
        title: `${overdueCards.length} revisões redistribuídas em ${days} dias`,
        description: `~${perDay} cards/dia · ${formatMinutes(minPerDay)} extra por dia`,
      });
    }

    // Invalidate to update UI
    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
    qc.invalidateQueries({ queryKey: ['study-queue'] });
    qc.invalidateQueries({ queryKey: ['decks'] });
    qc.invalidateQueries({ queryKey: ['deck-stats'] });
    qc.invalidateQueries({ queryKey: ['per-deck-new-counts'] });
  };

  const handleResetOverdue = async () => {
    if (allDeckIds.length === 0) return;
    setResetting(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    
    const { error } = await supabase
      .from('cards')
      .update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any)
      .in('deck_id', allDeckIds)
      .eq('state', 2)
      .lt('scheduled_date', cutoff.toISOString());
    
    setResetting(false);
    setShowResetConfirm(false);
    onOpenChange(false);
    
    if (error) {
      toast({ title: 'Erro ao resetar cards', description: error.message, variant: 'destructive' });
    } else {
      // Invalidate relevant queries so dashboard updates
      qc.invalidateQueries({ queryKey: ['plan-metrics'] });
      qc.invalidateQueries({ queryKey: ['per-deck-new-counts'] });
      qc.invalidateQueries({ queryKey: ['study-queue'] });
      qc.invalidateQueries({ queryKey: ['decks'] });
      qc.invalidateQueries({ queryKey: ['deck-stats'] });
      toast({ title: `${overdueCount} cards resetados`, description: 'Eles voltaram ao estado "novo" e serão reapresentados gradualmente.' });
    }
  };

  return (
    <>
      <Dialog open={open && !showResetConfirm} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Gerenciar Revisões Atrasadas
            </DialogTitle>
          </DialogHeader>

          {/* Educational explanation */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">O que são revisões atrasadas?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              São <strong>{totalReview} cards</strong> que já passaram da data ideal de revisão.
              Eles <strong>já estão incluídos</strong> na sua carga diária — quando você estuda,
              esses cards aparecem normalmente junto com os novos.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se o volume está alto demais, você pode <strong>redistribuí-los</strong> ao longo de
              vários dias para tornar a carga mais leve, ou <strong>resetar</strong> os cards
              muito antigos para recomeçar do zero.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Redistribuir ao longo de dias
            </p>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Move as datas de revisão para distribuir a carga uniformemente.
            </p>
            {[3, 5, 7].map(days => {
              const perDay = Math.ceil(totalReview / days);
              const minPerDay = Math.round((perDay * avgSecondsPerCard) / 60);
              return (
                <Button key={days} variant="outline" className="w-full justify-between h-auto py-3" onClick={() => handleDilute(days)} disabled={diluting}>
                  <span>{diluting ? 'Redistribuindo…' : <>Diluir em <strong>{days} dias</strong></>}</span>
                  <span className="text-xs text-muted-foreground">{perDay} cards/dia · {formatMinutes(minPerDay)}</span>
                </Button>
              );
            })}

            {/* Reset overdue option */}
            {overdueCount != null && overdueCount > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opção drástica</p>
                <p className="text-[11px] text-muted-foreground">
                  Cards com mais de 30 dias de atraso provavelmente já foram esquecidos.
                  Resetar faz eles voltarem como "novos" — você reestuda do zero.
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto py-3 border-destructive/30 text-destructive hover:bg-destructive/5"
                  onClick={() => setShowResetConfirm(true)}
                >
                  <span>Resetar <strong>{overdueCount}</strong> cards com &gt;30 dias de atraso</span>
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Double confirmation for reset */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Resetar {overdueCount} cards?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso é irreversível. Esses cards perderão todo o progresso de repetição espaçada e voltarão ao estado "novo".
              Use apenas se você ficou muito tempo sem estudar e quer recomeçar esses cards do zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetOverdue}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? 'Resetando...' : 'Sim, resetar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


// ─── Deck Hierarchy Selector ────────────────────────────
function DeckHierarchySelector({
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

  // Selection logic:
  // - Each deck is toggled independently (no cascade)
  // - User can select parent without children, or children without parent
  const handleToggle = (deckId: string, checked: boolean) => {
    if (checked) {
      setSelectedDeckIds(prev => [...new Set([...prev, deckId])]);
    } else {
      setSelectedDeckIds(prev => prev.filter(id => id !== deckId));
    }
  };

  // Select/deselect a parent AND all its descendants at once
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

  // Check state: true, false, or indeterminate (some descendants selected)
  const getCheckState = (deckId: string): boolean | 'indeterminate' => {
    const isSelected = selectedDeckIds.includes(deckId);
    const descendants = collectAllDescendants(deckId);
    if (descendants.length === 0) return isSelected;
    
    const selectedDescendants = descendants.filter(id => selectedDeckIds.includes(id));
    if (isSelected && selectedDescendants.length === descendants.length) return true;
    if (isSelected || selectedDescendants.length > 0) return 'indeterminate';
    return false;
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

    // For parents: check if ALL descendants are selected
    const allDescendants = hasChildren ? collectAllDescendants(deck.id) : [];
    const allDescendantsSelected = hasChildren && allDescendants.length > 0 && allDescendants.every(id => selectedDeckIds.includes(id));
    const someDescendantsSelected = hasChildren && allDescendants.some(id => selectedDeckIds.includes(id));

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
          {/* Expand/collapse or connector */}
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

          {/* Checkbox */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => handleToggle(deck.id, !!checked)}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Name and meta */}
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

          {/* Card count - icon + number like community folder previews */}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums shrink-0">
            <Layers className="h-3 w-3" />
            {hasChildren && isExpanded ? (
              <>{ownCards} <span className="text-[10px]">cards próprios</span></>
            ) : (
              <>{hasChildren ? totalCards : ownCards}</>
            )}
          </span>
        </label>

        {/* Select all children shortcut for parent decks */}
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
      {/* Header with info */}
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

      {/* Deck list */}
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
function ObjectiveDecksExpanded({ plan, activeDecks, avgSecondsPerCard, updatePlan }: {
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

// ─── Forecast Simulator Section (extracted to use hooks) ──
function ForecastSimulatorSection({ allDeckIds, dailyMinutes, weeklyMinutes, weeklyNewCards, plans, updateCapacity, metricsTotalNew }: {
  allDeckIds: string[]; dailyMinutes: number; weeklyMinutes: WeeklyMinutes | null; weeklyNewCards: WeeklyNewCards | null; plans: StudyPlanType[];
  updateCapacity: { mutateAsync: (input: { daily_study_minutes: number; weekly_study_minutes?: WeeklyMinutes | null }) => Promise<void> };
  metricsTotalNew?: number;
}) {
  const { forecastView, setForecastView } = useForecastView();
  const { toast } = useToast();
  const [newCardsOverride, setNewCardsOverride] = useState<number | undefined>();
  const [weeklyNewCardsOverride, setWeeklyNewCardsOverride] = useState<WeeklyNewCards | undefined>();
  const [createdCardsOverride, setCreatedCardsOverride] = useState<number | undefined>();
  const [dailyMinutesOverride, setDailyMinutesOverride] = useState<number | undefined>();
  const [weeklyMinutesOverride, setWeeklyMinutesOverride] = useState<WeeklyMinutes | undefined>();
  const [customTargetDate, setCustomTargetDate] = useState<Date | null>(null);
  const hasTargetDate = plans.some(p => p.target_date);
  // Find the latest (max) target date across all plans for created cards scoping
  const latestTargetDate = useMemo(() => {
    const plansWithDate = plans.filter(p => p.target_date);
    if (plansWithDate.length === 0) return null;
    return plansWithDate.reduce((max, p) => {
      const d = p.target_date!;
      return d > max ? d : max;
    }, plansWithDate[0].target_date!);
  }, [plans]);

  const effectiveDailyMin = dailyMinutesOverride ?? dailyMinutes;
  const effectiveWeeklyMin = weeklyMinutesOverride ?? weeklyMinutes;

  const horizonDays = useMemo(() => {
    if (forecastView === '7d') return 7;
    if (forecastView === '30d') return 30;
    if (forecastView === '90d') return 90;
    if (forecastView === '365d') return 365;
    if (forecastView === 'target') {
      const targetDateToUse = customTargetDate
        ?? (hasTargetDate
          ? plans.filter(p => p.target_date).reduce((min, p) => {
              const d = new Date(p.target_date!);
              return d < min ? d : min;
            }, new Date(plans.filter(p => p.target_date)[0].target_date!))
          : null);
      if (targetDateToUse) {
        const today = new Date(); today.setHours(0,0,0,0);
        return Math.max(7, Math.ceil((targetDateToUse.getTime() - today.getTime()) / 86400000));
      }
    }
    return 7;
  }, [forecastView, hasTargetDate, plans, customTargetDate]);

  const { data, summary, isSimulating, progress, defaultNewCardsPerDay, defaultCreatedCardsPerDay, totalNewCards, isUsingDefaults } = useForecastSimulator({
    deckIds: allDeckIds,
    horizonDays,
    newCardsPerDayOverride: newCardsOverride,
    createdCardsPerDayOverride: createdCardsOverride,
    dailyMinutes: effectiveDailyMin,
    weeklyMinutes: effectiveWeeklyMin,
    weeklyNewCards: weeklyNewCardsOverride ?? weeklyNewCards,
    enabled: allDeckIds.length > 0,
    latestTargetDate,
  });

  const handleViewChange = useCallback((v: ForecastView) => {
    setForecastView(v);
  }, [setForecastView]);

  const hasAnyOverride = newCardsOverride !== undefined || weeklyNewCardsOverride !== undefined || createdCardsOverride !== undefined || dailyMinutesOverride !== undefined || weeklyMinutesOverride !== undefined;

  const handleApplyCapacity = useCallback(async () => {
    try {
      await updateCapacity.mutateAsync({
        daily_study_minutes: effectiveDailyMin,
        weekly_study_minutes: weeklyMinutesOverride ?? null,
      });
      setDailyMinutesOverride(undefined);
      setWeeklyMinutesOverride(undefined);
      toast({ title: 'Capacidade atualizada!', description: 'Os valores simulados foram aplicados ao seu plano.' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
  }, [effectiveDailyMin, weeklyMinutesOverride, updateCapacity, toast]);

  return (
    <ForecastSimulator
      data={data} summary={summary} isSimulating={isSimulating} progress={progress}
      defaultNewCardsPerDay={defaultNewCardsPerDay} forecastView={forecastView}
      onViewChange={handleViewChange} newCardsOverride={newCardsOverride}
      onNewCardsChange={setNewCardsOverride} hasTargetDate={hasTargetDate}
      plans={plans.map(p => ({ id: p.id, name: p.name, target_date: p.target_date }))}
      customTargetDate={customTargetDate}
      onCustomTargetDate={setCustomTargetDate}
      isUsingDefaults={isUsingDefaults}
      totalNewCards={metricsTotalNew ?? totalNewCards}
      defaultCreatedCardsPerDay={defaultCreatedCardsPerDay}
      createdCardsOverride={createdCardsOverride}
      onCreatedCardsChange={setCreatedCardsOverride}
      realDailyMinutes={dailyMinutes}
      realWeeklyMinutes={weeklyMinutes}
      dailyMinutesOverride={dailyMinutesOverride}
      weeklyMinutesOverride={weeklyMinutesOverride}
      onDailyMinutesChange={setDailyMinutesOverride}
      onWeeklyMinutesChange={setWeeklyMinutesOverride}
      onApplyCapacity={handleApplyCapacity}
      hasAnyOverride={hasAnyOverride}
      realWeeklyNewCards={weeklyNewCards}
      weeklyNewCardsOverride={weeklyNewCardsOverride}
      onWeeklyNewCardsChange={setWeeklyNewCardsOverride}
    />
  );
}

// ═══════════════════════════════════════════════════════════
// ─── MAIN PAGE ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    plans, allDeckIds, expandedDeckIds, globalCapacity, isLoading, metrics, avgSecondsPerCard,
    calcImpact, createPlan, updatePlan, deletePlan, updateCapacity, updateNewCardsLimit, reorderObjectives,
  } = useStudyPlan();
  const { decks, isLoading: decksLoading } = useDecks();
  const { isPremium } = useSubscription();
  const activeDecks = useMemo(() => (decks ?? []).filter(d => !d.is_archived), [decks]);

  // View state
  const [view, setView] = useState<'home' | 'wizard'>('home');

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState<Date | undefined>();
  const [planName, setPlanName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // Dashboard states
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [editingWeekly, setEditingWeekly] = useState(false);
  const [tempMinutes, setTempMinutes] = useState(globalCapacity.dailyMinutes);
  const [tempWeekly, setTempWeekly] = useState<WeeklyMinutes>(
    globalCapacity.weeklyMinutes ?? { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 }
  );
  const [expandedObjective, setExpandedObjective] = useState<string | null>(null);
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [tempNewCards, setTempNewCards] = useState(globalCapacity.dailyNewCardsLimit);
  const [tempWeeklyNewCards, setTempWeeklyNewCards] = useState<WeeklyNewCards | null>(globalCapacity.weeklyNewCards);
  const [editingWeeklyNewCards, setEditingWeeklyNewCards] = useState(!!globalCapacity.weeklyNewCards);
  const [showNewCardsConfirm, setShowNewCardsConfirm] = useState(false);
  const [showWhatCanIDo, setShowWhatCanIDo] = useState(false);

  // Sync tempNewCards when globalCapacity loads/changes
  useEffect(() => {
    setTempNewCards(globalCapacity.dailyNewCardsLimit);
    setTempWeeklyNewCards(globalCapacity.weeklyNewCards);
    setEditingWeeklyNewCards(!!globalCapacity.weeklyNewCards);
  }, [globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards]);

  const healthStatus = (metrics?.healthStatus ?? 'green') as keyof typeof HEALTH_CONFIG;
  const needsAttention = metrics && (healthStatus === 'yellow' || healthStatus === 'orange' || healthStatus === 'red');
  const todayCapacity = metrics?.todayCapacityMinutes ?? globalCapacity.dailyMinutes;
  const isUsingWeekly = !!globalCapacity.weeklyMinutes;

  const ringPercent = metrics?.coveragePercent ?? (
    metrics ? Math.min(100, Math.round(metrics.planHealthPercent ?? 80)) : 50
  );


  // Capacity impact
  const impactMessage = useMemo(() => {
    if (!editingCapacity) return null;
    const impact = calcImpact(tempMinutes);
    if (!impact) return null;

    let text = '';
    let tone: 'warning' | 'success' | 'neutral' = 'neutral';

    if (impact.daysDiff != null) {
      if (impact.daysDiff > 0) {
        text = `Reduzir para ${formatMinutes(tempMinutes)} adiará sua conclusão em ~${impact.daysDiff} dias`;
        tone = 'warning';
      } else if (impact.daysDiff < 0) {
        text = `Aumentar para ${formatMinutes(tempMinutes)} adiantará em ~${Math.abs(impact.daysDiff)} dias`;
        tone = 'success';
      } else {
        text = `Com ${formatMinutes(tempMinutes)} você mantém o ritmo atual`;
      }
    } else {
      text = `Com ${formatMinutes(tempMinutes)} você revisará ~${impact.cardsPerDay} cards/dia`;
    }

    if (impact.peakDay && impact.peakMin > 0) {
      text += ` · Pico de ${formatMinutes(impact.peakMin)} previsto para ${impact.peakDay}`;
      if (tone !== 'warning') tone = 'warning';
    }

    return { text, tone };
  }, [editingCapacity, tempMinutes, calcImpact]);

  // Drag reorder for objectives (now persists priority)
  const { getHandlers: getObjHandlers, displayItems: orderedPlans } = useDragReorder({
    items: plans,
    getId: (p: StudyPlanType) => p.id,
    onReorder: async (reordered) => {
      try {
        await reorderObjectives.mutateAsync(reordered.map(p => p.id));
      } catch {
        toast({ title: 'Erro ao reordenar', variant: 'destructive' });
      }
    },
  });

  // ─── Handlers ───
  const handleConfirmPlan = async () => {
    try {
      const name = planName.trim() || 'Meu Objetivo';
      if (isEditing && editingPlanId) {
        await updatePlan.mutateAsync({
          id: editingPlanId,
          name,
          deck_ids: selectedDeckIds,
          target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null,
        });
        toast({ title: 'Objetivo atualizado!' });
      } else {
        if (!isPremium && plans.length >= 1) {
          toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais objetivos.', variant: 'destructive' });
          return;
        }
        await createPlan.mutateAsync({
          name,
          deck_ids: selectedDeckIds,
          target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null,
        });
        toast({ title: 'Objetivo criado! 🎯' });
      }
      setView('home');
      setIsEditing(false);
      setEditingPlanId(null);
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
  };

  const handleDeletePlan = async (planId: string) => {
    try {
      await deletePlan.mutateAsync(planId);
      toast({ title: 'Objetivo excluído' });
      setDeletingPlanId(null);
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const startEdit = (p: StudyPlanType) => {
    setEditingPlanId(p.id);
    setSelectedDeckIds(p.deck_ids ?? []);
    setTargetDate(p.target_date ? new Date(p.target_date) : undefined);
    setPlanName(p.name ?? '');
    setStep(1);
    setIsEditing(true);
    setView('wizard');
  };

  const startNewPlan = () => {
    if (!isPremium && plans.length >= 1) {
      toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais objetivos.', variant: 'destructive' });
      return;
    }
    setEditingPlanId(null);
    setSelectedDeckIds([]);
    setTargetDate(undefined);
    setPlanName('');
    setStep(1);
    setIsEditing(false);
    setView('wizard');
  };

  const handleSaveCapacity = async () => {
    try {
      await updateCapacity.mutateAsync({ daily_study_minutes: tempMinutes, weekly_study_minutes: null });
      toast({ title: 'Capacidade atualizada!' });
      setEditingCapacity(false);
    } catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  const handleSaveWeekly = async () => {
    try {
      const avg = Math.round(Object.values(tempWeekly).reduce((a, b) => a + b, 0) / 7);
      await updateCapacity.mutateAsync({ daily_study_minutes: avg, weekly_study_minutes: tempWeekly });
      toast({ title: 'Horário semanal salvo!' });
      setEditingWeekly(false);
      setEditingCapacity(false);
    } catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  // ─── Loading ───
  if (isLoading || decksLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // ─── WIZARD VIEW ──────────────────────────────────────
  // ═══════════════════════════════════════════════════════
  if (view === 'wizard') {
    // Feasibility check helper
    const feasibilityCheck = targetDate && selectedDeckIds.length > 0 ? (() => {
      // Recursive helper: sum new_count of a deck + all its descendants
      const getNewCardsRecursive = (deckId: string): number => {
        const deck = activeDecks.find(d => d.id === deckId);
        const own = deck?.new_count ?? 0;
        const children = activeDecks.filter(d => d.parent_deck_id === deckId);
        return own + children.reduce((s, c) => s + getNewCardsRecursive(c.id), 0);
      };
      // Only count from roots of selection to avoid double-counting
      const selectedNewCards = selectedDeckIds
        .filter(id => {
          const deck = activeDecks.find(d => d.id === id);
          // Skip if parent is also selected (parent already counts this deck)
          return !deck?.parent_deck_id || !selectedDeckIds.includes(deck.parent_deck_id);
        })
        .reduce((sum, id) => sum + getNewCardsRecursive(id), 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
      const budget = getWeeklyAvgNewCardsGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
      const minDaysNeeded = Math.ceil(selectedNewCards / budget);
      const isImpossible = daysLeft < minDaysNeeded;
      const isTight = !isImpossible && daysLeft === minDaysNeeded;
      if (!isImpossible && !isTight) return null;
      const suggestedDate = new Date(today);
      suggestedDate.setDate(suggestedDate.getDate() + minDaysNeeded); // +1 day margin so it's comfortable after applying
      const neededPerDay = Math.ceil(selectedNewCards / daysLeft);
      return { isImpossible, isTight, minDaysNeeded, suggestedDate, selectedNewCards, budget, daysLeft, neededPerDay };
    })() : null;

    const feasibilityBlock = feasibilityCheck && (
      <div className={cn(
        'rounded-lg border p-3 space-y-2',
        feasibilityCheck.isImpossible
          ? 'border-destructive/50 bg-destructive/5'
          : 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30'
      )}>
        <p className={cn('text-xs font-semibold', feasibilityCheck.isImpossible ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>
          {feasibilityCheck.isImpossible ? '⚠️ Meta inviável' : '⚡ Meta apertada'}
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {feasibilityCheck.isImpossible
            ? <>Seu ritmo atual de <strong>{feasibilityCheck.budget} cards/dia</strong> não é suficiente para cobrir os <strong>{feasibilityCheck.selectedNewCards} cards restantes</strong> até <strong>{format(targetDate!, "dd/MM/yyyy")}</strong>. Toque no botão abaixo para ver suas opções.</>
            : <>Você terminará os <strong>{feasibilityCheck.selectedNewCards} cards restantes</strong> exatamente na data definida (<strong>{format(targetDate!, "dd/MM/yyyy")}</strong>), sem margem para imprevistos.</>
          }
        </p>
        {feasibilityCheck.isImpossible && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs gap-1.5"
            onClick={() => setShowWhatCanIDo(true)}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            O que posso fazer?
          </Button>
        )}
        <WhatCanIDoDialog
          open={showWhatCanIDo}
          onOpenChange={setShowWhatCanIDo}
          totalNew={feasibilityCheck.selectedNewCards}
          neededPerDay={feasibilityCheck.neededPerDay}
          budget={feasibilityCheck.budget}
          suggestedDate={feasibilityCheck.suggestedDate}
          earliestTarget={targetDate!}
          avgDailyMin={getWeeklyAvgMinutesGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes)}
          reviewMinToday={metrics?.reviewMinutes ?? 0}
          avgSec={avgSecondsPerCard}
          effectiveRate={feasibilityCheck.budget}
          onApplyDate={(d) => setTargetDate(d)}
          onGoToCards={() => {
            setView('home');
            setIsEditing(false);
            setEditingPlanId(null);
            setTimeout(() => setTempNewCards(feasibilityCheck.neededPerDay), 100);
          }}
          onGoToCapacity={() => {
            setView('home');
            setIsEditing(false);
            setEditingPlanId(null);
            setTimeout(() => setEditingCapacity(true), 100);
          }}
        />
      </div>
    );

    // ─── EDIT MODE: Show all fields at once ───
    if (isEditing) {
      return (
        <div className="min-h-screen bg-background pb-24">
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setView('home'); setIsEditing(false); setEditingPlanId(null); }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-display text-lg font-bold flex-1">Editar Objetivo</h1>
          </header>

          <main className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold">Nome do objetivo</h2>
              </div>
              <Input
                placeholder="Ex: ENARE 2026"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="text-base"
              />
            </div>

            {/* Baralhos */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold">Baralhos</h2>
              </div>
              {activeDecks.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center space-y-3">
                    <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p>
                    <Button onClick={() => navigate('/dashboard')}>Criar baralho</Button>
                  </CardContent>
                </Card>
              ) : (
                <DeckHierarchySelector
                  decks={activeDecks}
                  selectedDeckIds={selectedDeckIds}
                  setSelectedDeckIds={setSelectedDeckIds}
                  plans={plans}
                  editingPlanId={editingPlanId}
                />
              )}
            </div>

            {/* Data limite */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold">Data pra completar o estudo</h2>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={targetDate} onSelect={setTargetDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {feasibilityBlock}
            </div>

            {/* Save */}
            <Button
              className="w-full" size="lg"
              onClick={handleConfirmPlan}
              disabled={!planName.trim() || selectedDeckIds.length === 0 || !targetDate || updatePlan.isPending}
            >
              {updatePlan.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>

            {/* Delete */}
            {editingPlanId && (
              <AlertDialog open={deletingPlanId === editingPlanId} onOpenChange={(open) => setDeletingPlanId(open ? editingPlanId : null)}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive text-xs">
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir objetivo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir objetivo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O objetivo "{planName}" será permanentemente excluído. Seus baralhos não serão afetados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
                      handleDeletePlan(editingPlanId);
                      setView('home');
                      setIsEditing(false);
                      setEditingPlanId(null);
                    }}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </main>
          <BottomNav />
        </div>
      );
    }

    // ─── CREATE MODE: Step-by-step wizard ───
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => {
            if (step > 1) { setStep((step - 1) as WizardStep); return; }
            setView('home');
          }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg font-bold flex-1">Novo Objetivo de Estudo</h1>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 max-w-2xl">
          {/* ─── STEP 1: Nome ─── */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold">Nome do objetivo</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Dê um nome curto para identificar esta meta. Pode ser o nome de uma prova, matéria ou concurso (ex: ENARE 2026, Residência USP).
                </p>
              </div>
              <Input
                placeholder="Ex: ENARE 2026"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="text-base"
                autoFocus
              />
              <Button
                className="w-full" size="lg"
                disabled={!planName.trim()}
                onClick={() => setStep(2)}
              >
                Continuar
              </Button>
            </div>
          )}

          {/* ─── STEP 2: Baralhos ─── */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Selecione os baralhos</h2>
                <p className="text-sm text-muted-foreground">
                  Escolha quais baralhos fazem parte deste objetivo.
                </p>
              </div>
              {activeDecks.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center space-y-3">
                    <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p>
                    <Button onClick={() => navigate('/dashboard')}>Criar baralho</Button>
                  </CardContent>
                </Card>
              ) : (
                <DeckHierarchySelector
                  decks={activeDecks}
                  selectedDeckIds={selectedDeckIds}
                  setSelectedDeckIds={setSelectedDeckIds}
                  plans={plans}
                  editingPlanId={editingPlanId}
                />
              )}
              <Button
                className="w-full" size="lg"
                disabled={selectedDeckIds.length === 0}
                onClick={() => setStep(3)}
              >
                Continuar
              </Button>
            </div>
          )}

          {/* ─── STEP 3: Data limite + Confirmar ─── */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Target className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold">Data pra completar o estudo</h2>
                </div>
                 <p className="text-sm text-muted-foreground">
                   Escolha até quando você quer ter <strong>dominado todos os cards novos</strong> dos baralhos selecionados.
                 </p>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={targetDate} onSelect={setTargetDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>

              {feasibilityBlock}

              <Button
                className="w-full" size="lg"
                onClick={handleConfirmPlan}
                disabled={!targetDate || createPlan.isPending}
              >
                {createPlan.isPending ? 'Salvando...' : 'Criar objetivo'}
              </Button>
            </div>
          )}
        </main>
        <BottomNav />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // ─── HOME / UNIFIED DASHBOARD ─────────────────────────
  // ═══════════════════════════════════════════════════════

  // No plans? Show empty state
  if (plans.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg font-bold flex-1">Meu Plano de Estudos</h1>
        </header>
        <main className="container mx-auto px-4 py-4 max-w-2xl">
          <div className="flex flex-col items-center justify-center py-10 sm:py-14 space-y-6 text-center">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Target className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            </div>
            <div className="space-y-3 max-w-sm">
              <h2 className="text-lg sm:text-xl font-bold">Monte seu plano de estudos</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Um <strong>objetivo</strong> é uma meta de estudo — como uma prova, concurso ou matéria que você precisa dominar até uma data específica.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ao criar um objetivo, você escolhe quais baralhos fazem parte dele e define um prazo. O sistema calcula automaticamente quantos cards novos você precisa estudar por dia para chegar pronto na data.
              </p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              <div className="rounded-xl border bg-muted/30 p-3 space-y-2 text-left">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Como funciona?
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="font-bold text-primary shrink-0">1.</span>
                    <span>Dê um nome ao objetivo (ex: <em>ENARE 2026</em>)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary shrink-0">2.</span>
                    <span>Selecione os baralhos que você precisa estudar</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-primary shrink-0">3.</span>
                    <span>Defina a data limite — o app distribui os cards automaticamente até lá</span>
                  </li>
                </ul>
              </div>

              <Button size="lg" onClick={startNewPlan} className="w-full">
                <Plus className="h-4 w-4 mr-2" /> Criar meu primeiro objetivo
              </Button>
            </div>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Build decks grouped by objective
  const decksByObjective = plans.map(p => {
    const ids = p.deck_ids ?? [];
    const objDecks = ids.map((id: string) => activeDecks.find(d => d.id === id)).filter(Boolean);
    return { plan: p, decks: objDecks };
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-bold flex-1">Meu Plano de Estudos</h1>
        <Button variant="ghost" size="icon" onClick={startNewPlan} title="Novo objetivo">
          <Plus className="h-5 w-5" />
        </Button>
      </header>

      <main className="container mx-auto px-4 py-3 max-w-2xl space-y-4">

        {/* ═══ 1. STATUS + CARGA DE HOJE ═══ */}
        {metrics && (
          <Card className={cn('border', HERO_GRADIENT[healthStatus])}>
            <CardContent className="p-4 md:p-5 space-y-3">
              {/* Desktop: side-by-side status + load | Mobile: stacked */}
              {/* Carga de hoje */}
              <div className="flex flex-col justify-center">
                <StudyLoadBar
                  estimatedMinutes={metrics.estimatedMinutesToday}
                  capacityMinutes={todayCapacity}
                  reviewMin={metrics.reviewMinutes}
                  newMin={metrics.newMinutes}
                />
              </div>

              {metrics.totalReview > 0 && (
                <Button
                  className="w-full md:w-auto" size="sm"
                  variant={healthStatus === 'red' || healthStatus === 'orange' ? 'destructive' : 'outline'}
                  onClick={() => setShowCatchUp(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {metrics.totalReview} revisões atrasadas
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ 2. MEUS OBJETIVOS ═══ */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            Meus Objetivos ({plans.length})
          </h3>

          {orderedPlans.map((p: StudyPlanType) => {
            const objHealth = getObjectiveHealth(p);
            const deckCount = p.deck_ids?.length ?? 0;
            const hasTarget = !!p.target_date;
            const isExpanded = expandedObjective === p.id;
            const objHandlers = getObjHandlers(p);

            return (
              <Card
                key={p.id}
                {...objHandlers}
                className={cn('transition-all', objHandlers.className)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name || 'Meu Objetivo'}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{deckCount} {deckCount === 1 ? 'baralho' : 'baralhos'}</span>
                        {hasTarget && (
                          <>
                            <span>·</span>
                            <span>{format(new Date(p.target_date!), "dd/MM/yy")}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Infeasible badge */}
                    {hasTarget && (() => {
                      const pNewCards = (p.deck_ids ?? []).reduce((sum, id) => {
                        const deck = activeDecks.find(d => d.id === id);
                        return sum + (deck?.new_count ?? 0);
                      }, 0);
                      const today = new Date(); today.setHours(0, 0, 0, 0);
                      const dLeft = Math.max(1, Math.ceil((new Date(p.target_date!).getTime() - today.getTime()) / 86400000));
                      const needed = Math.ceil(pNewCards / dLeft);
                      const budget = getWeeklyAvgNewCardsGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
                      if (needed > budget) {
                        return (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1.5 shrink-0">
                            Meta inviável
                          </Badge>
                        );
                      }
                      return null;
                    })()}

                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEdit(p); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExpandedObjective(isExpanded ? null : p.id); }}>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: show decks */}
                  {isExpanded && (
                    <div className="pt-1 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      <ObjectiveDecksExpanded
                        plan={p}
                        activeDecks={activeDecks}
                        avgSecondsPerCard={avgSecondsPerCard}
                        updatePlan={updatePlan}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Add / Premium upsell */}
          {!isPremium && plans.length >= 1 ? (
            <Card className="border-dashed border-primary/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium">Mais objetivos?</p>
                    <p className="text-[10px] text-muted-foreground">Assine Premium para objetivos ilimitados.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={startNewPlan}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar Objetivo
            </Button>
          )}
        </div>

        {/* ═══ 3. CONFIGURAÇÕES ═══ */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Configurações</h3>

          {/* New cards per day */}
          {metrics && (
            <Card>
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Novos cards por dia
                  </span>
                  {!(editingWeeklyNewCards || globalCapacity.weeklyNewCards) && (
                    <span className="text-base font-bold tabular-nums text-primary">
                      {tempNewCards}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Cards que você nunca estudou. O sistema distribui entre seus objetivos proporcionalmente.
                </p>
                <Slider
                  value={[tempNewCards]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => {
                    setTempNewCards(v[0]);
                    // If weekly overrides exist, update them proportionally
                    if (tempWeeklyNewCards) {
                      const oldGlobal = globalCapacity.dailyNewCardsLimit || 1;
                      const ratio = v[0] / oldGlobal;
                      const updated: WeeklyNewCards = {} as WeeklyNewCards;
                      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]) {
                        updated[day] = Math.round((tempWeeklyNewCards[day] ?? globalCapacity.dailyNewCardsLimit) * ratio);
                      }
                      setTempWeeklyNewCards(updated);
                    }
                  }}
                />

                {/* Weekly override toggle */}
                <button
                  className="text-[10px] text-primary hover:underline flex items-center gap-1"
                  onClick={() => {
                    if (editingWeeklyNewCards) {
                      setEditingWeeklyNewCards(false);
                      setTempWeeklyNewCards(null);
                    } else {
                      setEditingWeeklyNewCards(true);
                      setTempWeeklyNewCards(tempWeeklyNewCards ?? {
                        mon: tempNewCards, tue: tempNewCards, wed: tempNewCards,
                        thu: tempNewCards, fri: tempNewCards, sat: tempNewCards, sun: tempNewCards,
                      });
                    }
                  }}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {editingWeeklyNewCards ? 'Usar mesmo limite todos os dias' : 'Personalizar por dia da semana'}
                </button>

                {editingWeeklyNewCards && tempWeeklyNewCards && (
                  <div className="space-y-1.5 pt-1">
                    {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(day => (
                      <div key={day} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium w-6 text-muted-foreground">{DAY_LABELS[day]}</span>
                        <Slider
                          value={[tempWeeklyNewCards[day] ?? tempNewCards]}
                          onValueChange={([v]) => setTempWeeklyNewCards(prev => prev ? { ...prev, [day]: v } : prev)}
                          min={0} max={100} step={5} className="flex-1"
                        />
                        <span className={cn("text-[10px] font-semibold w-6 text-right tabular-nums", (tempWeeklyNewCards[day] ?? tempNewCards) === 0 && "text-muted-foreground")}>
                          {tempWeeklyNewCards[day] ?? tempNewCards}
                        </span>
                      </div>
                    ))}
                    <p className="text-[10px] text-center text-muted-foreground">
                      Média: <span className="font-semibold text-foreground">{getWeeklyAvgNewCardsGlobal(tempNewCards, tempWeeklyNewCards)} cards/dia</span>
                    </p>
                  </div>
                )}

                {(tempNewCards !== globalCapacity.dailyNewCardsLimit || JSON.stringify(tempWeeklyNewCards) !== JSON.stringify(globalCapacity.weeklyNewCards)) && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={() => setShowNewCardsConfirm(true)}
                    >
                      Confirmar ({editingWeeklyNewCards ? `média ${getWeeklyAvgNewCardsGlobal(tempNewCards, tempWeeklyNewCards)}` : tempNewCards} cards/dia)
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        setTempNewCards(globalCapacity.dailyNewCardsLimit);
                        setTempWeeklyNewCards(globalCapacity.weeklyNewCards);
                        setEditingWeeklyNewCards(!!globalCapacity.weeklyNewCards);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
                {metrics.deckNewAllocation && Object.keys(metrics.deckNewAllocation).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {plans.map(p => {
                      const alloc = metrics.newCardsAllocation[p.id] ?? 0;
                      if (alloc === 0) return null;
                      return (
                        <Badge key={p.id} variant="outline" className="text-[9px] h-4 px-1.5 font-normal">
                          {p.name}: {alloc}/dia
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ═══ 4. PREVISÃO DE CARGA (SIMULADOR) ═══ */}
        <ForecastSimulatorSection
          allDeckIds={expandedDeckIds}
          dailyMinutes={globalCapacity.dailyMinutes}
          weeklyMinutes={globalCapacity.weeklyMinutes}
          weeklyNewCards={globalCapacity.weeklyNewCards}
          plans={plans}
          updateCapacity={updateCapacity}
          metricsTotalNew={metrics?.totalNew}
        />

        {/* ═══ MODAL: Confirmar alteração de novos cards ═══ */}
        <AlertDialog open={showNewCardsConfirm} onOpenChange={setShowNewCardsConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar limite de novos cards?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  Você está alterando de <strong>{globalCapacity.dailyNewCardsLimit}</strong> para <strong>{tempNewCards}</strong> novos cards por dia.
                </span>
                <span className="block text-amber-600 dark:text-amber-400">
                  ⚠️ As cotas diárias de novos cards serão recalculadas e redistribuídas entre seus objetivos. O progresso de cards já estudados hoje não é afetado.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setTempNewCards(globalCapacity.dailyNewCardsLimit); setTempWeeklyNewCards(globalCapacity.weeklyNewCards); }}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                updateNewCardsLimit.mutateAsync({ limit: tempNewCards, weeklyNewCards: tempWeeklyNewCards });
                setShowNewCardsConfirm(false);
                toast({ title: 'Limite atualizado!', description: `Agora você estudará ${tempNewCards} novos cards por dia.` });
              }}>
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </main>

      {/* Dialogs */}
      <CatchUpDialog open={showCatchUp} onOpenChange={setShowCatchUp} totalReview={metrics?.totalReview ?? 0} avgSecondsPerCard={avgSecondsPerCard} allDeckIds={allDeckIds} />

      <BottomNav />
    </div>
  );
};

export default StudyPlan;
