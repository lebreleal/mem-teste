import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Clock, Target, CalendarIcon, Plus, GripVertical,
  ChevronDown, ChevronUp, Pencil, Brain, RotateCcw, Crown, Trash2,
  ChevronRight, Layers, Sparkles, HelpCircle, Info, FolderTree,
  Library, GraduationCap, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useStudyPlan, getWeeklyAvgMinutesGlobal, getWeeklyAvgNewCardsGlobal,
  DAY_LABELS, type StudyPlan as StudyPlanType, type DayKey, type WeeklyMinutes, type WeeklyNewCards,
} from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import type { DeckWithStats } from '@/types/deck';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { useDragReorder } from '@/hooks/useDragReorder';
import { StudyLoadBar } from '@/components/study-plan/PlanComponents';
import { formatMinutes, HEALTH_CONFIG, HERO_GRADIENT } from '@/components/study-plan/constants';
import { WhatCanIDoDialog, CatchUpDialog } from '@/components/study-plan/StudyPlanDialogs';
import { DeckHierarchySelector, ObjectiveDecksExpanded } from '@/components/study-plan/DeckHierarchySelector';
import { ForecastSimulatorSection } from '@/components/study-plan/ForecastSimulatorSection';
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

// ═══════════════════════════════════════════════════════════
// ─── MAIN PAGE ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    plans, allDeckIds, expandedDeckIds, globalCapacity, isLoading, metrics, avgSecondsPerCard,
    calcImpact, createPlan, updatePlan, deletePlan, updateCapacity, updateNewCardsLimit, reorderObjectives,
  } = useStudyPlan({ full: true });
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
      if (impact.daysDiff > 0) { text = `Reduzir para ${formatMinutes(tempMinutes)} adiará sua conclusão em ~${impact.daysDiff} dias`; tone = 'warning'; }
      else if (impact.daysDiff < 0) { text = `Aumentar para ${formatMinutes(tempMinutes)} adiantará em ~${Math.abs(impact.daysDiff)} dias`; tone = 'success'; }
      else { text = `Com ${formatMinutes(tempMinutes)} você mantém o ritmo atual`; }
    } else { text = `Com ${formatMinutes(tempMinutes)} você revisará ~${impact.cardsPerDay} cards/dia`; }
    if (impact.peakDay && impact.peakMin > 0) { text += ` · Pico de ${formatMinutes(impact.peakMin)} previsto para ${impact.peakDay}`; if (tone !== 'warning') tone = 'warning'; }
    return { text, tone };
  }, [editingCapacity, tempMinutes, calcImpact]);

  // Drag reorder for objectives
  const { getHandlers: getObjHandlers, displayItems: orderedPlans } = useDragReorder({
    items: plans,
    getId: (p: StudyPlanType) => p.id,
    onReorder: async (reordered) => {
      try { await reorderObjectives.mutateAsync(reordered.map(p => p.id)); }
      catch { toast({ title: 'Erro ao reordenar', variant: 'destructive' }); }
    },
  });

  // ─── Handlers ───
  const handleConfirmPlan = async () => {
    try {
      const name = planName.trim() || 'Meu Objetivo';
      if (isEditing && editingPlanId) {
        await updatePlan.mutateAsync({ id: editingPlanId, name, deck_ids: selectedDeckIds, target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null });
        toast({ title: 'Objetivo atualizado!' });
      } else {
        if (!isPremium && plans.length >= 1) { toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais objetivos.', variant: 'destructive' }); return; }
        await createPlan.mutateAsync({ name, deck_ids: selectedDeckIds, target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null });
        toast({ title: 'Objetivo criado! 🎯' });
      }
      setView('home'); setIsEditing(false); setEditingPlanId(null);
    } catch { toast({ title: 'Erro ao salvar', variant: 'destructive' }); }
  };

  const handleDeletePlan = async (planId: string) => {
    try { await deletePlan.mutateAsync(planId); toast({ title: 'Objetivo excluído' }); setDeletingPlanId(null); }
    catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }); }
  };

  const startEdit = (p: StudyPlanType) => {
    setEditingPlanId(p.id); setSelectedDeckIds(p.deck_ids ?? []); setTargetDate(p.target_date ? new Date(p.target_date) : undefined);
    setPlanName(p.name ?? ''); setStep(1); setIsEditing(true); setView('wizard');
  };

  const startNewPlan = () => {
    if (!isPremium && plans.length >= 1) { toast({ title: 'Limite atingido', description: 'Assine Premium para criar mais objetivos.', variant: 'destructive' }); return; }
    setEditingPlanId(null); setSelectedDeckIds([]); setTargetDate(undefined); setPlanName(''); setStep(1); setIsEditing(false); setView('wizard');
  };

  const handleSaveCapacity = async () => {
    try { await updateCapacity.mutateAsync({ daily_study_minutes: tempMinutes, weekly_study_minutes: null }); toast({ title: 'Capacidade atualizada!' }); setEditingCapacity(false); }
    catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  const handleSaveWeekly = async () => {
    try {
      const avg = Math.round(Object.values(tempWeekly).reduce((a, b) => a + b, 0) / 7);
      await updateCapacity.mutateAsync({ daily_study_minutes: avg, weekly_study_minutes: tempWeekly });
      toast({ title: 'Horário semanal salvo!' }); setEditingWeekly(false); setEditingCapacity(false);
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
    const feasibilityCheck = targetDate && selectedDeckIds.length > 0 ? (() => {
      const getNewCardsRecursive = (deckId: string): number => {
        const deck = activeDecks.find(d => d.id === deckId);
        const own = deck?.new_count ?? 0;
        const children = activeDecks.filter(d => d.parent_deck_id === deckId);
        return own + children.reduce((s, c) => s + getNewCardsRecursive(c.id), 0);
      };
      const selectedNewCards = selectedDeckIds
        .filter(id => { const deck = activeDecks.find(d => d.id === id); return !deck?.parent_deck_id || !selectedDeckIds.includes(deck.parent_deck_id); })
        .reduce((sum, id) => sum + getNewCardsRecursive(id), 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
      const budget = getWeeklyAvgNewCardsGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
      const minDaysNeeded = Math.ceil(selectedNewCards / budget);
      const isImpossible = daysLeft < minDaysNeeded;
      const isTight = !isImpossible && daysLeft === minDaysNeeded;
      if (!isImpossible && !isTight) return null;
      const suggestedDate = new Date(today);
      suggestedDate.setDate(suggestedDate.getDate() + minDaysNeeded);
      const neededPerDay = Math.ceil(selectedNewCards / daysLeft);
      return { isImpossible, isTight, minDaysNeeded, suggestedDate, selectedNewCards, budget, daysLeft, neededPerDay };
    })() : null;

    const feasibilityBlock = feasibilityCheck && (
      <div className={cn(
        'rounded-lg border p-3 space-y-2',
        feasibilityCheck.isImpossible ? 'border-destructive/50 bg-destructive/5' : 'border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30'
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
          <Button size="sm" variant="outline" className="w-full text-xs gap-1.5" onClick={() => setShowWhatCanIDo(true)}>
            <HelpCircle className="h-3.5 w-3.5" /> O que posso fazer?
          </Button>
        )}
        <WhatCanIDoDialog
          open={showWhatCanIDo} onOpenChange={setShowWhatCanIDo}
          totalNew={feasibilityCheck.selectedNewCards} neededPerDay={feasibilityCheck.neededPerDay}
          budget={feasibilityCheck.budget} suggestedDate={feasibilityCheck.suggestedDate}
          earliestTarget={targetDate!}
          avgDailyMin={getWeeklyAvgMinutesGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes)}
          reviewMinToday={metrics?.reviewMinutes ?? 0} avgSec={avgSecondsPerCard}
          effectiveRate={feasibilityCheck.budget}
          onApplyDate={(d) => setTargetDate(d)}
          onGoToCards={() => { setView('home'); setIsEditing(false); setEditingPlanId(null); setTimeout(() => setTempNewCards(feasibilityCheck.neededPerDay), 100); }}
          onGoToCapacity={() => { setView('home'); setIsEditing(false); setEditingPlanId(null); setTimeout(() => setEditingCapacity(true), 100); }}
        />
      </div>
    );

    // ─── EDIT MODE ───
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
            <div className="space-y-2">
              <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">Nome do objetivo</h2></div>
              <Input placeholder="Ex: ENARE 2026" value={planName} onChange={(e) => setPlanName(e.target.value)} className="text-base" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">Baralhos</h2></div>
              {activeDecks.length === 0 ? (
                <Card className="border-dashed"><CardContent className="p-6 text-center space-y-3"><BookOpen className="h-10 w-10 text-muted-foreground mx-auto" /><p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p><Button onClick={() => navigate('/dashboard')}>Criar baralho</Button></CardContent></Card>
              ) : (
                <DeckHierarchySelector decks={activeDecks} selectedDeckIds={selectedDeckIds} setSelectedDeckIds={setSelectedDeckIds} plans={plans} editingPlanId={editingPlanId} />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">Data pra completar o estudo</h2></div>
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
            <Button className="w-full" size="lg" onClick={handleConfirmPlan} disabled={!planName.trim() || selectedDeckIds.length === 0 || !targetDate || updatePlan.isPending}>
              {updatePlan.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
            {editingPlanId && (
              <AlertDialog open={deletingPlanId === editingPlanId} onOpenChange={(open) => setDeletingPlanId(open ? editingPlanId : null)}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive text-xs"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir objetivo</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Excluir objetivo?</AlertDialogTitle><AlertDialogDescription>O objetivo "{planName}" será permanentemente excluído. Seus baralhos não serão afetados.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { handleDeletePlan(editingPlanId); setView('home'); setIsEditing(false); setEditingPlanId(null); }}>Excluir</AlertDialogAction>
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
          <Button variant="ghost" size="icon" onClick={() => { if (step > 1) { setStep((step - 1) as WizardStep); return; } setView('home'); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg font-bold flex-1">Novo Objetivo de Estudo</h1>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (<div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />))}
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 max-w-2xl">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <div className="flex items-center gap-2 mb-1"><GraduationCap className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Nome do objetivo</h2></div>
                <p className="text-sm text-muted-foreground">Dê um nome curto para identificar esta meta. Pode ser o nome de uma prova, matéria ou concurso (ex: ENARE 2026, Residência USP).</p>
              </div>
              <Input placeholder="Ex: ENARE 2026" value={planName} onChange={(e) => setPlanName(e.target.value)} className="text-base" autoFocus />
              <Button className="w-full" size="lg" disabled={!planName.trim()} onClick={() => setStep(2)}>Continuar</Button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div><h2 className="text-xl font-bold mb-1">Selecione os baralhos</h2><p className="text-sm text-muted-foreground">Escolha quais baralhos fazem parte deste objetivo.</p></div>
              {activeDecks.length === 0 ? (
                <Card className="border-dashed"><CardContent className="p-6 text-center space-y-3"><BookOpen className="h-10 w-10 text-muted-foreground mx-auto" /><p className="text-sm text-muted-foreground">Você ainda não tem baralhos.</p><Button onClick={() => navigate('/dashboard')}>Criar baralho</Button></CardContent></Card>
              ) : (
                <DeckHierarchySelector decks={activeDecks} selectedDeckIds={selectedDeckIds} setSelectedDeckIds={setSelectedDeckIds} plans={plans} editingPlanId={editingPlanId} />
              )}
              <Button className="w-full" size="lg" disabled={selectedDeckIds.length === 0} onClick={() => setStep(3)}>Continuar</Button>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <div className="flex items-center gap-2 mb-1"><Target className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Data pra completar o estudo</h2></div>
                <p className="text-sm text-muted-foreground">Escolha até quando você quer ter <strong>dominado todos os cards novos</strong> dos baralhos selecionados.</p>
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
              <Button className="w-full" size="lg" onClick={handleConfirmPlan} disabled={!targetDate || createPlan.isPending}>
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

  const noPlansCTA = plans.length === 0 ? (
    <Card className="border-dashed border-primary/30">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Target className="h-5 w-5 text-primary" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Crie um objetivo</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">Defina metas com prazo para que o sistema distribua seus cards automaticamente.</p>
        </div>
        <Button size="sm" onClick={startNewPlan} className="shrink-0"><Plus className="h-3.5 w-3.5 mr-1" /> Criar</Button>
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-display text-lg font-bold flex-1">Meu Plano de Estudos</h1>
        <Button variant="ghost" size="icon" onClick={startNewPlan} title="Novo objetivo"><Plus className="h-5 w-5" /></Button>
      </header>

      <main className="container mx-auto px-4 py-3 max-w-2xl space-y-4">
        {noPlansCTA}

        {/* STATUS + CARGA DE HOJE */}
        {plans.length > 0 && metrics && (
          <Card className={cn('border', HERO_GRADIENT[healthStatus])}>
            <CardContent className="p-4 md:p-5 space-y-3">
              <div className="flex flex-col justify-center">
                <StudyLoadBar estimatedMinutes={metrics.estimatedMinutesToday} capacityMinutes={todayCapacity} reviewMin={metrics.reviewMinutes} newMin={metrics.newMinutes} />
              </div>
              {metrics.totalReview > 0 && (
                <Button className="w-full md:w-auto" size="sm" variant={healthStatus === 'red' || healthStatus === 'orange' ? 'destructive' : 'outline'} onClick={() => setShowCatchUp(true)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> {metrics.totalReview} revisões atrasadas
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* MEUS OBJETIVOS */}
        {plans.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Meus Objetivos ({plans.length})</h3>
          {orderedPlans.map((p: StudyPlanType) => {
            const objHealth = getObjectiveHealth(p);
            const deckCount = p.deck_ids?.length ?? 0;
            const hasTarget = !!p.target_date;
            const isExpanded = expandedObjective === p.id;
            const objHandlers = getObjHandlers(p);
            return (
              <Card key={p.id} {...objHandlers} className={cn('transition-all', objHandlers.className)}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name || 'Meu Objetivo'}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{deckCount} {deckCount === 1 ? 'baralho' : 'baralhos'}</span>
                        {hasTarget && (<><span>·</span><span>{format(new Date(p.target_date!), "dd/MM/yy")}</span></>)}
                      </div>
                    </div>
                    {hasTarget && (() => {
                      const pNewCards = (p.deck_ids ?? []).reduce((sum, id) => { const deck = activeDecks.find(d => d.id === id); return sum + (deck?.new_count ?? 0); }, 0);
                      const today = new Date(); today.setHours(0, 0, 0, 0);
                      const dLeft = Math.max(1, Math.ceil((new Date(p.target_date!).getTime() - today.getTime()) / 86400000));
                      const needed = Math.ceil(pNewCards / dLeft);
                      const budget = getWeeklyAvgNewCardsGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
                      if (needed > budget) return <Badge variant="destructive" className="text-[9px] h-4 px-1.5 shrink-0">Meta inviável</Badge>;
                      return null;
                    })()}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEdit(p); }}><Pencil className="h-3 w-3 text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExpandedObjective(isExpanded ? null : p.id); }}>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="pt-1 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      <ObjectiveDecksExpanded plan={p} activeDecks={activeDecks} avgSecondsPerCard={avgSecondsPerCard} updatePlan={updatePlan} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!isPremium && plans.length >= 1 ? (
            <Card className="border-dashed border-primary/30"><CardContent className="p-3"><div className="flex items-center gap-3"><div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0"><Crown className="h-3.5 w-3.5 text-amber-500" /></div><div className="flex-1"><p className="text-xs font-medium">Mais objetivos?</p><p className="text-[10px] text-muted-foreground">Assine Premium para objetivos ilimitados.</p></div></div></CardContent></Card>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={startNewPlan}><Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar Objetivo</Button>
          )}
        </div>
        )}

        {/* CONFIGURAÇÕES */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Configurações</h3>
          {metrics && (
            <Card>
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" />Novos cards por dia</span>
                  {!(editingWeeklyNewCards || globalCapacity.weeklyNewCards) && <span className="text-base font-bold tabular-nums text-primary">{tempNewCards}</span>}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Cards que você nunca estudou. {plans.length > 0 ? 'O sistema distribui entre seus objetivos proporcionalmente.' : 'Crie um objetivo para que este limite global seja aplicado na fila de estudo.'}
                </p>
                <Slider value={[tempNewCards]} min={0} max={100} step={5} onValueChange={(v) => {
                  setTempNewCards(v[0]);
                  if (tempWeeklyNewCards) {
                    const oldGlobal = globalCapacity.dailyNewCardsLimit || 1;
                    const ratio = v[0] / oldGlobal;
                    const updated: WeeklyNewCards = {} as WeeklyNewCards;
                    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]) { updated[day] = Math.round((tempWeeklyNewCards[day] ?? globalCapacity.dailyNewCardsLimit) * ratio); }
                    setTempWeeklyNewCards(updated);
                  }
                }} />
                <button className="text-[10px] text-primary hover:underline flex items-center gap-1" onClick={() => {
                  if (editingWeeklyNewCards) { setEditingWeeklyNewCards(false); setTempWeeklyNewCards(null); }
                  else { setEditingWeeklyNewCards(true); setTempWeeklyNewCards(tempWeeklyNewCards ?? { mon: tempNewCards, tue: tempNewCards, wed: tempNewCards, thu: tempNewCards, fri: tempNewCards, sat: tempNewCards, sun: tempNewCards }); }
                }}>
                  <CalendarIcon className="h-3 w-3" />
                  {editingWeeklyNewCards ? 'Usar mesmo limite todos os dias' : 'Personalizar por dia da semana'}
                </button>
                {editingWeeklyNewCards && tempWeeklyNewCards && (
                  <div className="space-y-1.5 pt-1">
                    {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(day => (
                      <div key={day} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium w-6 text-muted-foreground">{DAY_LABELS[day]}</span>
                        <Slider value={[tempWeeklyNewCards[day] ?? tempNewCards]} onValueChange={([v]) => setTempWeeklyNewCards(prev => prev ? { ...prev, [day]: v } : prev)} min={0} max={100} step={5} className="flex-1" />
                        <span className={cn("text-[10px] font-semibold w-6 text-right tabular-nums", (tempWeeklyNewCards[day] ?? tempNewCards) === 0 && "text-muted-foreground")}>{tempWeeklyNewCards[day] ?? tempNewCards}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-center text-muted-foreground">Média: <span className="font-semibold text-foreground">{getWeeklyAvgNewCardsGlobal(tempNewCards, tempWeeklyNewCards)} cards/dia</span></p>
                  </div>
                )}
                {(tempNewCards !== globalCapacity.dailyNewCardsLimit || JSON.stringify(tempWeeklyNewCards) !== JSON.stringify(globalCapacity.weeklyNewCards)) && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={() => setShowNewCardsConfirm(true)}>
                      Confirmar ({editingWeeklyNewCards ? `média ${getWeeklyAvgNewCardsGlobal(tempNewCards, tempWeeklyNewCards)}` : tempNewCards} cards/dia)
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setTempNewCards(globalCapacity.dailyNewCardsLimit); setTempWeeklyNewCards(globalCapacity.weeklyNewCards); setEditingWeeklyNewCards(!!globalCapacity.weeklyNewCards); }}>Cancelar</Button>
                  </div>
                )}
                {metrics.deckNewAllocation && Object.keys(metrics.deckNewAllocation).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {plans.map(p => { const alloc = metrics.newCardsAllocation[p.id] ?? 0; if (alloc === 0) return null; return <Badge key={p.id} variant="outline" className="text-[9px] h-4 px-1.5 font-normal">{p.name}: {alloc}/dia</Badge>; })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* PREVISÃO DE CARGA */}
        <ForecastSimulatorSection
          allDeckIds={expandedDeckIds} dailyMinutes={globalCapacity.dailyMinutes}
          weeklyMinutes={globalCapacity.weeklyMinutes} weeklyNewCards={globalCapacity.weeklyNewCards}
          plans={plans} updateCapacity={updateCapacity} metricsTotalNew={metrics?.totalNew}
        />

        {/* MODAL: Confirmar alteração de novos cards */}
        <AlertDialog open={showNewCardsConfirm} onOpenChange={setShowNewCardsConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar limite de novos cards?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">Você está alterando de <strong>{globalCapacity.dailyNewCardsLimit}</strong> para <strong>{tempNewCards}</strong> novos cards por dia.</span>
                {plans.length > 0 ? (
                  <span className="block text-amber-600 dark:text-amber-400">⚠️ As cotas diárias de novos cards serão recalculadas e redistribuídas entre seus objetivos. O progresso de cards já estudados hoje não é afetado.</span>
                ) : (
                  <span className="block text-muted-foreground">Este valor será usado como referência na simulação. Sem objetivos ativos, cada baralho usa seu próprio limite individual.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setTempNewCards(globalCapacity.dailyNewCardsLimit); setTempWeeklyNewCards(globalCapacity.weeklyNewCards); }}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { updateNewCardsLimit.mutateAsync({ limit: tempNewCards, weeklyNewCards: tempWeeklyNewCards }); setShowNewCardsConfirm(false); }}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* CatchUp Dialog */}
        <CatchUpDialog open={showCatchUp} onOpenChange={setShowCatchUp} totalReview={metrics?.totalReview ?? 0} avgSecondsPerCard={avgSecondsPerCard} allDeckIds={allDeckIds} />
      </main>
      <BottomNav />
    </div>
  );
};

export default StudyPlan;
