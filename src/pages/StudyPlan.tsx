import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Clock, Target, CalendarIcon, Plus, GripVertical,
  ChevronDown, ChevronUp, Pencil, Brain, RotateCcw, Crown, Trash2,
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
import {
  useStudyPlan, getMinutesForDayGlobal, getWeeklyAvgMinutesGlobal,
  DAY_LABELS, type StudyPlan as StudyPlanType, type DayKey, type WeeklyMinutes,
} from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { useDragReorder } from '@/hooks/useDragReorder';
import { HealthRing, StudyLoadBar, ForecastChart, CompactDeckRow } from '@/components/study-plan/PlanComponents';
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

// ─── Catch-Up Dialog ────────────────────────────────────
function CatchUpDialog({ open, onOpenChange, totalReview, avgSecondsPerCard }: {
  open: boolean; onOpenChange: (v: boolean) => void; totalReview: number; avgSecondsPerCard: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Limpar Atraso</DialogTitle>
          <DialogDescription>
            Você tem <strong>{totalReview}</strong> revisões pendentes. Escolha como diluir:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {[3, 5, 7].map(days => {
            const perDay = Math.ceil(totalReview / days);
            const minPerDay = Math.round((perDay * avgSecondsPerCard) / 60);
            return (
              <Button key={days} variant="outline" className="w-full justify-between h-auto py-3" onClick={() => onOpenChange(false)}>
                <span>Diluir em <strong>{days} dias</strong></span>
                <span className="text-xs text-muted-foreground">{perDay} cards/dia · {formatMinutes(minPerDay)}</span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// ─── MAIN PAGE ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    plans, globalCapacity, isLoading, metrics, avgSecondsPerCard,
    calcImpact, createPlan, updatePlan, deletePlan, updateCapacity, reorderObjectives,
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

  const healthStatus = (metrics?.healthStatus ?? 'green') as keyof typeof HEALTH_CONFIG;
  const needsAttention = metrics && (healthStatus === 'yellow' || healthStatus === 'orange' || healthStatus === 'red');
  const todayCapacity = metrics?.todayCapacityMinutes ?? globalCapacity.dailyMinutes;
  const isUsingWeekly = !!globalCapacity.weeklyMinutes;

  const ringPercent = metrics?.coveragePercent ?? (
    metrics ? Math.min(100, Math.round(metrics.planHealthPercent ?? 80)) : 50
  );

  // Step 2 preview metrics
  const step2Metrics = useMemo(() => {
    if (selectedDeckIds.length === 0) return null;
    const avg = avgSecondsPerCard;
    const cardsPerDay = Math.floor((globalCapacity.dailyMinutes * 60) / avg);
    const cardsPerWeek = cardsPerDay * 7;
    let daysLeft: number | null = null;
    if (targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
    }
    return { cardsPerDay, cardsPerWeek, daysLeft, avgSeconds: avg };
  }, [selectedDeckIds, globalCapacity.dailyMinutes, targetDate, avgSecondsPerCard]);

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
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => {
            if (step > 1) { setStep((step - 1) as WizardStep); return; }
            setView('home');
            setIsEditing(false);
            setEditingPlanId(null);
          }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg font-bold flex-1">
            {isEditing ? 'Editar Objetivo' : 'Novo Objetivo de Estudo'}
          </h1>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 max-w-lg">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Nome do objetivo</h2>
                <p className="text-sm text-muted-foreground">Dê um nome que identifique este objetivo (ex: ENARE 2026, Farmacologia).</p>
              </div>
              <Input
                placeholder="Ex: ENARE 2026"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="text-base"
              />
              <div>
                <h2 className="text-xl font-bold mb-1">Baralhos deste objetivo</h2>
                <p className="text-sm text-muted-foreground">Selecione os baralhos que fazem parte deste objetivo.</p>
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
                <div className="space-y-2">
                  {activeDecks.map(deck => {
                    const otherPlans = plans.filter(p => p.id !== editingPlanId && (p.deck_ids ?? []).includes(deck.id));
                    return (
                      <label
                        key={deck.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                          selectedDeckIds.includes(deck.id)
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:bg-muted/50',
                          deck.parent_deck_id && 'ml-6'
                        )}
                      >
                        <Checkbox
                          checked={selectedDeckIds.includes(deck.id)}
                          onCheckedChange={(checked) => {
                            setSelectedDeckIds(prev =>
                              checked ? [...prev, deck.id] : prev.filter(id => id !== deck.id)
                            );
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{deck.name}</p>
                          {otherPlans.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              Já em: {otherPlans.map(p => p.name).join(', ')}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Data limite <span className="text-muted-foreground font-normal">(ex: prova)</span>
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data (opcional)'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={targetDate} onSelect={setTargetDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                {targetDate && (
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setTargetDate(undefined)}>
                    Remover data
                  </Button>
                )}
              </div>
              <Button className="w-full" size="lg" disabled={selectedDeckIds.length === 0} onClick={() => setStep(2)}>
                Continuar
              </Button>
            </div>
          )}

          {step === 2 && step2Metrics && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Aqui está o que calculamos</h2>
                <p className="text-sm text-muted-foreground">Com base nos seus baralhos e tempo médio por card.</p>
              </div>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tempo médio por card</p>
                      <p className="font-bold">{Math.round(step2Metrics.avgSeconds)}s</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{step2Metrics.cardsPerDay}</p>
                      <p className="text-xs text-muted-foreground">cards/dia</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{step2Metrics.cardsPerWeek}</p>
                      <p className="text-xs text-muted-foreground">cards/semana</p>
                    </div>
                  </div>
                  {targetDate && step2Metrics.daysLeft && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-sm">📅 <strong>{step2Metrics.daysLeft} dias</strong> até {format(targetDate, "dd/MM/yyyy")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Button className="w-full" size="lg" onClick={() => setStep(3)}>Continuar</Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Capacidade global</h2>
                <p className="text-sm text-muted-foreground">
                  Sua capacidade diária atual é <strong>{formatMinutes(globalCapacity.dailyMinutes)}</strong>.
                  Ela é compartilhada entre todos os seus objetivos.
                </p>
              </div>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{formatMinutes(globalCapacity.dailyMinutes)}/dia</p>
                      <p className="text-xs text-muted-foreground">Capacidade global compartilhada</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    💡 Você pode ajustar sua capacidade a qualquer momento no dashboard do plano, após criar o objetivo.
                  </p>
                </CardContent>
              </Card>
              <Button
                className="w-full" size="lg"
                onClick={handleConfirmPlan}
                disabled={createPlan.isPending || updatePlan.isPending}
              >
                {createPlan.isPending || updatePlan.isPending ? 'Salvando...' : isEditing ? 'Salvar alterações ✨' : 'Criar objetivo ✨'}
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
        <main className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Target className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold">Nenhum objetivo criado</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Crie objetivos de estudo para organizar sua rotina e acompanhar seu progresso.
              </p>
            </div>
            <Button size="lg" onClick={startNewPlan}>
              <Plus className="h-4 w-4 mr-2" /> Criar meu primeiro objetivo
            </Button>
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

      <main className="container mx-auto px-4 py-3 max-w-lg space-y-3">

        {/* ═══ 1. HERO CARD (Global) ═══ */}
        {metrics && (
          <Card className={cn('border', HERO_GRADIENT[healthStatus])}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-4">
                <HealthRing percent={ringPercent} status={healthStatus} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                      HEALTH_CONFIG[healthStatus].bg, HEALTH_CONFIG[healthStatus].text, HEALTH_CONFIG[healthStatus].border
                    )}>
                      {HEALTH_CONFIG[healthStatus].icon} {HEALTH_CONFIG[healthStatus].label}
                    </span>
                    {metrics.planHealthPercent != null && metrics.planHealthPercent < 80 && (
                      <span className="text-[10px] text-muted-foreground">
                        Consistência: {metrics.planHealthPercent}%
                      </span>
                    )}
                  </div>
                  <StudyLoadBar
                    estimatedMinutes={metrics.estimatedMinutesToday}
                    capacityMinutes={todayCapacity}
                    reviewMin={metrics.reviewMinutes}
                    newMin={metrics.newMinutes}
                  />
                </div>
              </div>
              {needsAttention && (
                <Button
                  className="w-full" size="sm"
                  variant={healthStatus === 'red' ? 'destructive' : 'default'}
                  onClick={() => {
                    if (metrics.totalReview > 20) setShowCatchUp(true);
                    else { setEditingCapacity(true); setTempMinutes(globalCapacity.dailyMinutes); }
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {metrics.totalReview > 20 ? 'Resolver Atraso' : 'Ajustar Plano'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══ 2. MEUS OBJETIVOS (No "Principal" concept) ═══ */}
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

                    {/* Health dot */}
                    <div className={cn(
                      'h-2.5 w-2.5 rounded-full shrink-0',
                      objHealth === 'green' && 'bg-emerald-500',
                      objHealth === 'yellow' && 'bg-amber-500',
                      objHealth === 'orange' && 'bg-orange-500',
                      objHealth === 'red' && 'bg-red-500',
                    )} />

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

                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEdit(p); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setExpandedObjective(isExpanded ? null : p.id); }}>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: show decks + delete */}
                  {isExpanded && (
                    <div className="pt-1 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                      {(p.deck_ids ?? []).map((id: string) => {
                        const deck = activeDecks.find(d => d.id === id);
                        if (!deck) return null;
                        return <CompactDeckRow key={deck.id} deck={deck} avgSecondsPerCard={avgSecondsPerCard} showGrip={false} />;
                      })}
                      {(p.deck_ids ?? []).length === 0 && (
                        <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum baralho associado</p>
                      )}
                      <div className="flex gap-1 pt-1">
                        <AlertDialog open={deletingPlanId === p.id} onOpenChange={(open) => setDeletingPlanId(open ? p.id : null)}>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-[10px] h-6 px-2">
                              <Trash2 className="h-3 w-3 mr-1" /> Excluir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir objetivo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O objetivo "{p.name}" será permanentemente excluído. Seus baralhos não serão afetados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeletePlan(p.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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

        {/* ═══ 3. CAPACIDADE DIÁRIA GLOBAL ═══ */}
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Capacidade Diária Global</h3>
              {!editingCapacity && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                  setEditingCapacity(true);
                  setTempMinutes(globalCapacity.dailyMinutes);
                  setEditingWeekly(isUsingWeekly);
                  setTempWeekly(globalCapacity.weeklyMinutes ?? { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 });
                }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>

            {editingCapacity ? (
              <div className="space-y-2.5">
                <div className="flex gap-1">
                  <Button size="sm" variant={!editingWeekly ? 'default' : 'outline'} className="h-6 text-[10px] flex-1" onClick={() => setEditingWeekly(false)}>
                    Igual todo dia
                  </Button>
                  <Button size="sm" variant={editingWeekly ? 'default' : 'outline'} className="h-6 text-[10px] flex-1" onClick={() => setEditingWeekly(true)}>
                    Por dia da semana
                  </Button>
                </div>

                {editingWeekly ? (
                  <div className="space-y-1.5">
                    {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(day => (
                      <div key={day} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium w-6 text-muted-foreground">{DAY_LABELS[day]}</span>
                        <Slider value={[tempWeekly[day]]} onValueChange={([v]) => setTempWeekly(prev => ({ ...prev, [day]: v }))} min={0} max={240} step={15} className="flex-1" />
                        <span className="text-[10px] font-semibold w-10 text-right">{formatMinutes(tempWeekly[day])}</span>
                      </div>
                    ))}
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveWeekly}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setEditingWeekly(false); setEditingCapacity(false); }}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-primary">{formatMinutes(tempMinutes)}</p>
                      <p className="text-[10px] text-muted-foreground">por dia</p>
                    </div>
                    <Slider value={[tempMinutes]} onValueChange={([v]) => setTempMinutes(v)} min={15} max={240} step={15} className="py-2" />
                    <div className="flex justify-between text-[9px] text-muted-foreground px-1">
                      {SLIDER_MARKS.map(m => (
                        <span key={m} className={cn(tempMinutes === m && 'text-primary font-bold')}>{formatMinutes(m)}</span>
                      ))}
                    </div>
                    {impactMessage && (
                      <div className={cn(
                        'rounded-lg px-2.5 py-1.5 text-[10px]',
                        impactMessage.tone === 'warning' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
                        impactMessage.tone === 'success' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                        impactMessage.tone === 'neutral' && 'bg-muted text-muted-foreground',
                      )}>
                        💡 {impactMessage.text}
                      </div>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveCapacity}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setEditingCapacity(false); setTempMinutes(globalCapacity.dailyMinutes); }}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Clock className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {isUsingWeekly
                      ? <>{formatMinutes(todayCapacity)} hoje <span className="text-muted-foreground font-normal text-xs">(média {formatMinutes(getWeeklyAvgMinutesGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes))}/dia)</span></>
                      : <>{formatMinutes(globalCapacity.dailyMinutes)}/dia <span className="text-muted-foreground font-normal text-xs">({metrics?.cardsPerDay ?? '?'} cards)</span></>
                    }
                  </p>
                  {metrics?.projectedCompletionDate && (
                    <p className="text-[10px] text-muted-foreground">
                      📅 Conclusão estimada: {format(new Date(metrics.projectedCompletionDate), "dd/MM/yyyy")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ 4. PREVISÃO DE CARGA CONSOLIDADA ═══ */}
        {metrics?.forecastData && metrics.forecastData.length > 0 && (
          <ForecastChart data={metrics.forecastData} />
        )}

        {/* ═══ 5. BARALHOS POR OBJETIVO ═══ */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Baralhos por Objetivo</h3>
          {decksByObjective.map(({ plan: p, decks: objDecks }) => (
            <div key={p.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-2 w-2 rounded-full shrink-0 bg-primary'
                )} />
                <p className="text-xs font-semibold text-muted-foreground">{p.name || 'Objetivo'}</p>
                <span className="text-[9px] text-muted-foreground">({objDecks.length})</span>
              </div>
              {objDecks.length > 0 ? (
                objDecks.map((deck: any) => (
                  <CompactDeckRow key={deck.id} deck={deck} avgSecondsPerCard={avgSecondsPerCard} showGrip={false} />
                ))
              ) : (
                <p className="text-[10px] text-muted-foreground pl-4">Nenhum baralho</p>
              )}
            </div>
          ))}
        </div>

        {/* Clear backlog */}
        {!needsAttention && metrics && metrics.totalReview > 0 && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCatchUp(true)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Limpar Atraso ({metrics.totalReview} revisões)
          </Button>
        )}
      </main>

      {/* Dialogs */}
      <CatchUpDialog open={showCatchUp} onOpenChange={setShowCatchUp} totalReview={metrics?.totalReview ?? 0} avgSecondsPerCard={avgSecondsPerCard} />

      <BottomNav />
    </div>
  );
};

export default StudyPlan;
