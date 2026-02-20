import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarCheck, BookOpen, Clock, Target, AlertTriangle,
  Pencil, Trash2, CalendarIcon, ChevronUp, ChevronDown, Brain,
  Flame, TrendingUp, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import BottomNav from '@/components/BottomNav';

type WizardStep = 1 | 2 | 3;

const SLIDER_MARKS = [15, 30, 45, 60, 90, 120, 180, 240];

function formatMinutes(m: number) {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

const HEALTH_CONFIG = {
  green: { color: 'bg-emerald-500', label: 'No Trilho', text: 'text-emerald-600' },
  yellow: { color: 'bg-amber-500', label: 'Atenção', text: 'text-amber-600' },
  orange: { color: 'bg-orange-500', label: 'Intenso', text: 'text-orange-600' },
  red: { color: 'bg-red-500', label: 'Meta em Risco', text: 'text-red-600' },
};

// ─── Study Load Gauge (Termômetro de Tempo) ─────────────
function StudyLoadGauge({ estimatedMinutes, dailyMinutes }: { estimatedMinutes: number; dailyMinutes: number }) {
  const maxDisplay = Math.max(dailyMinutes * 2, 150);
  const percent = Math.min(100, (estimatedMinutes / maxDisplay) * 100);

  // 4 color segments based on user's daily capacity
  const g = (dailyMinutes * 0.7 / maxDisplay) * 100;
  const y = (dailyMinutes / maxDisplay) * 100;
  const o = (dailyMinutes * 1.5 / maxDisplay) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Carga de hoje</span>
        <span className="text-lg font-bold">{formatMinutes(estimatedMinutes)}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-muted">
        {/* Color segments */}
        <div className="absolute inset-0 flex">
          <div className="bg-emerald-400/60" style={{ width: `${g}%` }} />
          <div className="bg-amber-400/60" style={{ width: `${y - g}%` }} />
          <div className="bg-orange-400/60" style={{ width: `${o - y}%` }} />
          <div className="bg-red-400/60" style={{ width: `${100 - o}%` }} />
        </div>
        {/* Indicator */}
        <div
          className="absolute top-0 h-full w-1 bg-foreground rounded-full shadow-md transition-all duration-500"
          style={{ left: `${Math.min(percent, 99)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Leve</span>
        <span>Moderado</span>
        <span>Intenso</span>
        <span>Sobrecarga</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────
const StudyPlan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { plan, isLoading, metrics, avgSecondsPerCard, calcImpact, createPlan, updatePlan, deletePlan } = useStudyPlan();
  const { decks, isLoading: decksLoading } = useDecks();
  const activeDecks = useMemo(() => (decks ?? []).filter(d => !d.is_archived), [decks]);

  const [step, setStep] = useState<WizardStep>(1);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState<Date | undefined>();
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [isEditing, setIsEditing] = useState(false);

  const step2Metrics = useMemo(() => {
    if (selectedDeckIds.length === 0) return null;
    const avg = avgSecondsPerCard;
    const cardsPerDay = Math.floor((dailyMinutes * 60) / avg);
    const cardsPerWeek = cardsPerDay * 7;
    let daysLeft: number | null = null;
    if (targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000));
    }
    return { cardsPerDay, cardsPerWeek, daysLeft, avgSeconds: avg };
  }, [selectedDeckIds, dailyMinutes, targetDate, avgSecondsPerCard]);

  const handleConfirmPlan = async () => {
    try {
      const input = {
        daily_minutes: dailyMinutes,
        deck_ids: selectedDeckIds,
        target_date: targetDate ? format(targetDate, 'yyyy-MM-dd') : null,
      };
      if (isEditing) {
        await updatePlan.mutateAsync(input);
        toast({ title: 'Plano atualizado!' });
      } else {
        await createPlan.mutateAsync(input);
        toast({ title: 'Plano criado com sucesso! 🎯' });
      }
      setIsEditing(false);
    } catch {
      toast({ title: 'Erro ao salvar plano', variant: 'destructive' });
    }
  };

  const handleDeletePlan = async () => {
    try {
      await deletePlan.mutateAsync();
      toast({ title: 'Plano excluído' });
      setIsEditing(false);
      setStep(1);
      setSelectedDeckIds([]);
      setTargetDate(undefined);
      setDailyMinutes(60);
    } catch {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
  };

  const startEdit = () => {
    if (!plan) return;
    setSelectedDeckIds(plan.deck_ids ?? []);
    setTargetDate(plan.target_date ? new Date(plan.target_date) : undefined);
    setDailyMinutes(plan.daily_minutes);
    setStep(1);
    setIsEditing(true);
  };

  if (isLoading || decksLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (plan && !isEditing) {
    return (
      <PlanDashboard
        plan={plan}
        metrics={metrics}
        decks={activeDecks}
        avgSecondsPerCard={avgSecondsPerCard}
        calcImpact={calcImpact}
        onEdit={startEdit}
        onDelete={handleDeletePlan}
        onUpdatePlan={updatePlan.mutateAsync}
      />
    );
  }

  // ─── Wizard ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => {
          if (isEditing) { setIsEditing(false); return; }
          if (step > 1) { setStep((step - 1) as WizardStep); return; }
          navigate(-1);
        }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-bold flex-1">
          {isEditing ? 'Editar Plano' : 'Meu Plano de Estudo'}
        </h1>
        <div className="flex gap-1">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn('h-1.5 w-6 rounded-full transition-colors', s <= step ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">O que você precisa estudar?</h2>
              <p className="text-sm text-muted-foreground">Selecione os baralhos que deseja incluir no plano.</p>
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
                {activeDecks.map(deck => (
                  <label
                    key={deck.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                      selectedDeckIds.includes(deck.id)
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:bg-muted/50'
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
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Tem uma data limite? <span className="text-muted-foreground font-normal">(ex: prova)</span>
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !targetDate && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {targetDate ? format(targetDate, "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Selecionar data (opcional)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={targetDate}
                    onSelect={setTargetDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
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

        {/* Step 2 */}
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
                <p className="text-sm text-muted-foreground">
                  Com <strong>{formatMinutes(dailyMinutes)}</strong> por dia, você revisa ~<strong>{step2Metrics.cardsPerDay} cards</strong>.
                </p>
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

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold mb-1">Quanto tempo você tem por dia?</h2>
              <p className="text-sm text-muted-foreground">Ajuste para definir sua disponibilidade.</p>
            </div>
            <Card>
              <CardContent className="p-5 space-y-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-primary">{formatMinutes(dailyMinutes)}</p>
                  <p className="text-sm text-muted-foreground mt-1">por dia</p>
                </div>
                <Slider
                  value={[dailyMinutes]}
                  onValueChange={([v]) => setDailyMinutes(v)}
                  min={15} max={240} step={15}
                  className="py-4"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  {SLIDER_MARKS.map(m => (
                    <span key={m} className={cn(dailyMinutes === m && 'text-primary font-bold')}>{formatMinutes(m)}</span>
                  ))}
                </div>
                {step2Metrics && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xl font-bold text-primary">{Math.floor((dailyMinutes * 60) / avgSecondsPerCard)}</p>
                        <p className="text-xs text-muted-foreground">cards/dia</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xl font-bold text-primary">{Math.floor((dailyMinutes * 60) / avgSecondsPerCard) * 7}</p>
                        <p className="text-xs text-muted-foreground">cards/semana</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Button
              className="w-full" size="lg"
              onClick={handleConfirmPlan}
              disabled={createPlan.isPending || updatePlan.isPending}
            >
              {createPlan.isPending || updatePlan.isPending ? 'Salvando...' : 'Confirmar meu plano ✨'}
            </Button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

// ─── Plan Dashboard ─────────────────────────────────────
interface PlanDashboardProps {
  plan: any;
  metrics: any;
  decks: any[];
  avgSecondsPerCard: number;
  calcImpact: (m: number) => any;
  onEdit: () => void;
  onDelete: () => void;
  onUpdatePlan: (input: any) => Promise<void>;
}

function PlanDashboard({ plan, metrics, decks, avgSecondsPerCard, calcImpact, onEdit, onDelete, onUpdatePlan }: PlanDashboardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [tempMinutes, setTempMinutes] = useState(plan.daily_minutes);
  const [editingDate, setEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState<Date | undefined>(plan.target_date ? new Date(plan.target_date) : undefined);

  const health = metrics ? HEALTH_CONFIG[metrics.healthStatus] : HEALTH_CONFIG.green;

  const planDecks = useMemo(() => {
    const ids = plan.deck_ids ?? [];
    return ids.map((id: string) => decks.find(d => d.id === id)).filter(Boolean);
  }, [plan.deck_ids, decks]);

  const statusMessage = useMemo(() => {
    if (!metrics) return '';
    if (metrics.healthStatus === 'green') return 'Você está no caminho certo! 🎯';
    if (metrics.healthStatus === 'yellow') return 'Carga moderada, continue assim!';
    if (metrics.healthStatus === 'orange') return 'Carga intensa — considere ajustar o plano.';
    return 'Meta em risco — ajuste seu plano para não acumular.';
  }, [metrics]);

  const impactMessage = useMemo(() => {
    if (!editingMinutes) return null;
    const impact = calcImpact(tempMinutes);
    if (!impact) return null;
    if (impact.daysDiff != null) {
      if (impact.daysDiff > 0)
        return `⚠️ Reduzir para ${formatMinutes(tempMinutes)} adiará sua conclusão em ~${impact.daysDiff} dias`;
      if (impact.daysDiff < 0)
        return `✅ Aumentar para ${formatMinutes(tempMinutes)} adiantará sua conclusão em ~${Math.abs(impact.daysDiff)} dias`;
      return `Com ${formatMinutes(tempMinutes)} você mantém o ritmo atual`;
    }
    return `Com ${formatMinutes(tempMinutes)} você revisará ~${impact.cardsPerDay} cards/dia`;
  }, [editingMinutes, tempMinutes, calcImpact]);

  const handleSaveMinutes = async () => {
    try {
      await onUpdatePlan({ daily_minutes: tempMinutes });
      toast({ title: 'Tempo atualizado!' });
      setEditingMinutes(false);
    } catch {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const handleSaveDate = async () => {
    try {
      await onUpdatePlan({ target_date: tempDate ? format(tempDate, 'yyyy-MM-dd') : null });
      toast({ title: 'Data atualizada!' });
      setEditingDate(false);
    } catch {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const handleReorder = useCallback(async (index: number, direction: 'up' | 'down') => {
    const ids = [...(plan.deck_ids ?? [])];
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[index], ids[newIdx]] = [ids[newIdx], ids[index]];
    try {
      await onUpdatePlan({ deck_ids: ids });
    } catch {
      toast({ title: 'Erro ao reordenar', variant: 'destructive' });
    }
  }, [plan.deck_ids, onUpdatePlan, toast]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CalendarCheck className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold flex-1">Meu Plano</h1>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-1" /> Editar
        </Button>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg space-y-4">

        {/* ─── LEVEL 1: Termômetro + Status (Progressive Disclosure) ─── */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardContent className="p-5 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn('h-3 w-3 rounded-full', health.color)} />
                  <span className={cn('text-sm font-semibold', health.text)}>{health.label}</span>
                  <TrendingUp className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                </div>

                {metrics && (
                  <StudyLoadGauge
                    estimatedMinutes={metrics.estimatedMinutesToday}
                    dailyMinutes={plan.daily_minutes}
                  />
                )}

                <p className="text-sm text-muted-foreground mt-3">{statusMessage}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {expanded ? 'Toque para recolher' : 'Toque para ver detalhes'}
                </p>
              </CardContent>
            </CollapsibleTrigger>

            {/* ─── LEVEL 2: Detailed breakdown ─── */}
            <CollapsibleContent>
              <CardContent className="pt-0 px-5 pb-5 space-y-3 border-t">
                {metrics && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-lg font-bold">{formatMinutes(metrics.reviewMinutes)}</p>
                        <p className="text-[10px] text-muted-foreground">Revisões</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-lg font-bold">{formatMinutes(metrics.newMinutes)}</p>
                        <p className="text-[10px] text-muted-foreground">Novos Cards</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold">{metrics.totalNew}</p>
                        <p className="text-[10px] text-muted-foreground">Novos</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{metrics.totalLearning}</p>
                        <p className="text-[10px] text-muted-foreground">Aprendendo</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{metrics.totalReview}</p>
                        <p className="text-[10px] text-muted-foreground">Revisão</p>
                      </div>
                    </div>

                    {/* Level 3 link */}
                    <p className="text-[10px] text-muted-foreground text-center pt-2">
                      Ajustes avançados (FSRS) estão disponíveis nas configurações de cada baralho.
                    </p>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ─── 3 Pilares ─── */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Seus 3 Pilares</h3>

            {/* Pilar 1: Data de Conclusão */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground">Quando terminarei de ver tudo?</p>
                {editingDate ? (
                  <div className="space-y-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn('w-full justify-start text-left text-xs', !tempDate && 'text-muted-foreground')}>
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {tempDate ? format(tempDate, "dd/MM/yyyy") : 'Sem data'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={tempDate} onSelect={setTempDate} disabled={(d) => d < new Date()} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveDate}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDate(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditingDate(true)} className="text-sm font-semibold hover:underline">
                    {plan.target_date
                      ? `${format(new Date(plan.target_date), "dd/MM/yyyy")} (${metrics?.daysRemaining ?? '?'} dias)`
                      : 'Sem data definida'}
                  </button>
                )}
              </div>
            </div>

            {/* Pilar 2: Taxa de Retenção */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground">Taxa de retenção desejada</p>
                <p className="text-sm font-semibold">{Math.round((metrics?.avgRetention ?? 0.9) * 100)}%</p>
              </div>
            </div>

            {/* Pilar 3: Capacidade Diária */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground">Capacidade diária</p>
                {editingMinutes ? (
                  <div className="space-y-2">
                    <Slider
                      value={[tempMinutes]}
                      onValueChange={([v]) => setTempMinutes(v)}
                      min={15} max={240} step={15}
                    />
                    <p className="text-sm font-semibold text-center">{formatMinutes(tempMinutes)}</p>
                    {impactMessage && (
                      <p className="text-xs text-muted-foreground">{impactMessage}</p>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveMinutes}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingMinutes(false); setTempMinutes(plan.daily_minutes); }}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditingMinutes(true)} className="text-sm font-semibold hover:underline">
                    {formatMinutes(plan.daily_minutes)} ({metrics?.cardsPerDay ?? '?'} cards/dia)
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Coverage / Target Date Progress ─── */}
        {plan.target_date && metrics && metrics.coveragePercent != null && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Meta até {format(new Date(plan.target_date), "dd/MM/yyyy")}</span>
              </div>
              <Progress value={metrics.coveragePercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cobertura: {metrics.coveragePercent}%</span>
                {metrics.requiredCardsPerDay != null && (
                  <span>Necessário: {metrics.requiredCardsPerDay} cards/dia</span>
                )}
              </div>
              {metrics.coveragePercent < 50 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    Seu ritmo atual pode não ser suficiente. Considere aumentar o tempo diário ou focar em menos baralhos.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Saúde do Plano (%) ─── */}
        {metrics && metrics.planHealthPercent != null && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Saúde do Plano</span>
                <span className="ml-auto text-sm font-bold">{metrics.planHealthPercent}%</span>
              </div>
              <Progress
                value={metrics.planHealthPercent}
                className={cn('h-2', metrics.planHealthPercent < 50 && '[&>div]:bg-red-500', metrics.planHealthPercent < 80 && metrics.planHealthPercent >= 50 && '[&>div]:bg-amber-500')}
              />
              <p className="text-xs text-muted-foreground">
                Baseado na consistência: dias em que você estudou vs. dias desde a criação do plano.
              </p>
              {metrics.planHealthPercent < 80 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Sua Saúde do Plano está em {metrics.planHealthPercent}%. Que tal ajustarmos sua carga?
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Catch-up / Limpar Atraso ─── */}
        {metrics && metrics.totalReview > 0 && (
          <Button variant="outline" className="w-full" onClick={() => setShowCatchUp(true)}>
            <RotateCcw className="h-4 w-4 mr-2" /> Limpar Atraso ({metrics.totalReview} revisões pendentes)
          </Button>
        )}

        <CatchUpDialog
          open={showCatchUp}
          onOpenChange={setShowCatchUp}
          totalReview={metrics?.totalReview ?? 0}
          avgSecondsPerCard={avgSecondsPerCard}
        />

        {/* ─── Deck Prioritization ─── */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
              Prioridade dos Baralhos
            </h3>
            {planDecks.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum baralho no plano.</p>
            )}
            {planDecks.map((deck: any, i: number) => (
              <div key={deck.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                <p className="text-sm font-medium flex-1 truncate">{deck.name}</p>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  disabled={i === 0}
                  onClick={() => handleReorder(i, 'up')}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  disabled={i === planDecks.length - 1}
                  onClick={() => handleReorder(i, 'down')}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Delete */}
        <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" /> Excluir plano
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}

// ─── Catch-Up Dialog ─────────────────────────────────
function CatchUpDialog({ open, onOpenChange, totalReview, avgSecondsPerCard }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  totalReview: number;
  avgSecondsPerCard: number;
}) {
  const options = [3, 5, 7];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Limpar Atraso</DialogTitle>
          <DialogDescription>
            Você tem <strong>{totalReview}</strong> revisões pendentes. Escolha em quantos dias deseja diluir:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {options.map(days => {
            const extra = Math.ceil(totalReview / days);
            const extraMin = Math.round((extra * avgSecondsPerCard) / 60);
            return (
              <div key={days} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Diluir em {days} dias</p>
                  <p className="text-xs text-muted-foreground">
                    +{extra} cards extras/dia (~{formatMinutes(extraMin)} a mais)
                  </p>
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground text-center pt-2">
            O sistema de estudo já prioriza revisões vencidas automaticamente. Estas sugestões servem como referência para seu planejamento.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudyPlan;
