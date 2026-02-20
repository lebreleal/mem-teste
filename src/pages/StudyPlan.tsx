import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarCheck, BookOpen, Clock, Target, AlertTriangle,
  Pencil, Trash2, CalendarIcon, Brain,
  Flame, TrendingUp, RotateCcw, Heart, ChevronRight, Settings2,
  GripVertical, MoreVertical, Pause, X as XIcon, Play
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useDragReorder } from '@/hooks/useDragReorder';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
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
import { useStudyPlan, getMinutesForDay, getWeeklyAvgMinutes, DAY_LABELS, type DayKey, type WeeklyMinutes, type WeeklyCardDataPoint } from '@/hooks/useStudyPlan';
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
  green: { color: 'bg-emerald-500', ring: 'text-emerald-500', label: 'No Caminho', text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: '✓' },
  yellow: { color: 'bg-amber-500', ring: 'text-amber-500', label: 'Atenção', text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: '!' },
  orange: { color: 'bg-orange-500', ring: 'text-orange-500', label: 'Intenso', text: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: '!!' },
  red: { color: 'bg-red-500', ring: 'text-red-500', label: 'Em Risco', text: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: '⚠' },
};

// ─── Weekly Card Chart ─────────────────────────────────
function WeeklyCardChart({ data, status }: { data: WeeklyCardDataPoint[]; status: keyof typeof HEALTH_CONFIG }) {
  const cfg = HEALTH_CONFIG[status];

  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border', cfg.bg, cfg.text, cfg.border)}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barGap={2}>
          <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
            formatter={(value: number, name: string) => [value, name === 'review' ? 'Revisão' : 'Novos']}
            labelFormatter={(label: string) => label}
          />
          <Bar dataKey="review" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} name="review" />
          <Bar dataKey="newCards" stackId="a" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} name="newCards" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Study Load Bar (Termômetro de Tempo) ─────────────
function StudyLoadBar({ estimatedMinutes, capacityMinutes, recommendedMinutes, reviewMin, newMin, capacityCards, recommendedCards }: {
  estimatedMinutes: number; capacityMinutes: number; recommendedMinutes: number | null;
  reviewMin: number; newMin: number; capacityCards: number; recommendedCards: number | null;
}) {
  const maxDisplay = Math.max(capacityMinutes * 2, 150);
  const percent = Math.min(100, (estimatedMinutes / maxDisplay) * 100);
  const g = (capacityMinutes * 0.7 / maxDisplay) * 100;
  const y = (capacityMinutes / maxDisplay) * 100;
  const o = (capacityMinutes * 1.5 / maxDisplay) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">Carga de hoje</span>
        <span className="text-xl font-bold text-foreground">{formatMinutes(estimatedMinutes)}</span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden bg-muted">
        <div className="absolute inset-0 flex">
          <div className="bg-emerald-400/50" style={{ width: `${g}%` }} />
          <div className="bg-amber-400/50" style={{ width: `${y - g}%` }} />
          <div className="bg-orange-400/50" style={{ width: `${o - y}%` }} />
          <div className="bg-red-400/50" style={{ width: `${100 - o}%` }} />
        </div>
        <div
          className="absolute top-0 h-full w-1 bg-foreground rounded-full shadow transition-all duration-500"
          style={{ left: `${Math.min(percent, 99)}%` }}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">
          {formatMinutes(reviewMin)} Revisões + {formatMinutes(newMin)} Novos Cards
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">
            🎯 Sua capacidade: <strong className="text-foreground">{capacityCards} cards</strong> ({formatMinutes(capacityMinutes)})
          </span>
          {recommendedCards != null && recommendedMinutes != null && (
            <span className="text-muted-foreground">
              📊 Sistema: <strong className="text-foreground">{recommendedCards} cards</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Deck Study Card (Carousel Item) ──────────────────
function DeckStudyCard({ deck, avgSecondsPerCard }: { deck: any; avgSecondsPerCard: number }) {
  const navigate = useNavigate();
  const totalCards = deck.card_count ?? 0;
  const newCards = deck.new_count ?? 0;
  const reviewCards = deck.review_count ?? 0;
  const pendingCards = newCards + reviewCards;
  const doneCards = Math.max(0, totalCards - pendingCards);
  const progressPercent = totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0;
  const estimatedMinutes = Math.round((pendingCards * avgSecondsPerCard) / 60);

  return (
    <div className="min-w-[260px] max-w-[300px] snap-start flex flex-col rounded-xl border bg-card p-4 space-y-3 shrink-0">
      <h4 className="font-semibold text-sm truncate">{deck.name}</h4>
      <div className="flex gap-1.5 flex-wrap">
        {newCards > 0 && <Badge variant="outline" className="text-[10px] h-5">{newCards} novos</Badge>}
        {reviewCards > 0 && <Badge variant="outline" className="text-[10px] h-5">{reviewCards} revisões</Badge>}
        {pendingCards === 0 && <Badge variant="secondary" className="text-[10px] h-5">✓ Concluído</Badge>}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{pendingCards > 0 ? 'Inicie seu estudo' : 'Tudo em dia!'}</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> Est. {formatMinutes(estimatedMinutes)}
        </span>
      </div>
      <Progress value={progressPercent} className="h-1.5" />
      <p className="text-[10px] text-muted-foreground">{progressPercent}% concluído</p>
      <div className="flex items-center gap-2 mt-auto">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => navigate(`/study/${deck.id}`)}>
          <Play className="h-3 w-3 mr-1" /> Estudar
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8 rounded-full shrink-0" onClick={() => navigate(`/deck/${deck.id}`)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

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

// ═══════════════════════════════════════════════════════════
// ─── UNIFIED PLAN DASHBOARD ─────────────────────────────
// ═══════════════════════════════════════════════════════════

const HERO_GRADIENT = {
  green: 'bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-200/60 dark:border-emerald-800/40',
  yellow: 'bg-gradient-to-br from-amber-50/50 to-white dark:from-amber-950/20 dark:to-background border-amber-200/60 dark:border-amber-800/40',
  orange: 'bg-gradient-to-br from-orange-50/50 to-white dark:from-orange-950/20 dark:to-background border-orange-200/60 dark:border-orange-800/40',
  red: 'bg-gradient-to-br from-red-50/50 to-white dark:from-red-950/20 dark:to-background border-red-200/60 dark:border-red-800/40',
};

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
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [editingWeekly, setEditingWeekly] = useState(false);
  const [tempMinutes, setTempMinutes] = useState(plan.daily_minutes);
  const [tempWeekly, setTempWeekly] = useState<WeeklyMinutes>(
    plan.weekly_minutes ?? { mon: plan.daily_minutes, tue: plan.daily_minutes, wed: plan.daily_minutes, thu: plan.daily_minutes, fri: plan.daily_minutes, sat: plan.daily_minutes, sun: plan.daily_minutes }
  );
  const [editingDate, setEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState<Date | undefined>(plan.target_date ? new Date(plan.target_date) : undefined);
  const [editingRetention, setEditingRetention] = useState(false);
  const [tempRetention, setTempRetention] = useState(Math.round((metrics?.avgRetention ?? 0.9) * 100));

  const healthStatus = (metrics?.healthStatus ?? 'green') as keyof typeof HEALTH_CONFIG;
  const needsAttention = metrics && (healthStatus === 'yellow' || healthStatus === 'orange' || healthStatus === 'red');

  const todayCapacity = metrics?.todayCapacityMinutes ?? plan.daily_minutes;

  const planDecks = useMemo(() => {
    const ids = plan.deck_ids ?? [];
    return ids.map((id: string) => decks.find(d => d.id === id)).filter(Boolean);
  }, [plan.deck_ids, decks]);

  // Drag-and-drop reorder
  const { getHandlers, displayItems } = useDragReorder({
    items: planDecks,
    getId: (deck: any) => deck.id,
    onReorder: async (reordered: any[]) => {
      try {
        await onUpdatePlan({ deck_ids: reordered.map((d: any) => d.id) });
      } catch {
        toast({ title: 'Erro ao reordenar', variant: 'destructive' });
      }
    },
  });

  const impactMessage = useMemo(() => {
    if (!editingMinutes) return null;
    const impact = calcImpact(tempMinutes);
    if (!impact) return null;
    if (impact.daysDiff != null) {
      if (impact.daysDiff > 0)
        return { text: `Reduzir para ${formatMinutes(tempMinutes)} adiará sua conclusão em ~${impact.daysDiff} dias`, tone: 'warning' as const };
      if (impact.daysDiff < 0)
        return { text: `Aumentar para ${formatMinutes(tempMinutes)} adiantará sua conclusão em ~${Math.abs(impact.daysDiff)} dias`, tone: 'success' as const };
      return { text: `Com ${formatMinutes(tempMinutes)} você mantém o ritmo atual`, tone: 'neutral' as const };
    }
    return { text: `Com ${formatMinutes(tempMinutes)} você revisará ~${impact.cardsPerDay} cards/dia`, tone: 'neutral' as const };
  }, [editingMinutes, tempMinutes, calcImpact]);

  const handleSaveMinutes = async () => {
    try {
      await onUpdatePlan({ daily_minutes: tempMinutes, weekly_minutes: null });
      toast({ title: 'Tempo atualizado!' });
      setEditingMinutes(false);
    } catch {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const handleSaveWeekly = async () => {
    try {
      const avg = Math.round(Object.values(tempWeekly).reduce((a, b) => a + b, 0) / 7);
      await onUpdatePlan({ daily_minutes: avg, weekly_minutes: tempWeekly });
      toast({ title: 'Horário semanal salvo!' });
      setEditingWeekly(false);
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

  const handleSaveRetention = async () => {
    try {
      // Update retention for all decks in the plan
      const deckIds = plan.deck_ids ?? [];
      const retention = tempRetention / 100;
      for (const id of deckIds) {
        await supabase.from('decks').update({ requested_retention: retention }).eq('id', id);
      }
      toast({ title: 'Retenção atualizada!' });
      setEditingRetention(false);
    } catch {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    }
  };

  const isUsingWeekly = !!plan.weekly_minutes;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-bold flex-1">Meu Plano de Estudos</h1>
        <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
          <Settings2 className="h-5 w-5" />
        </Button>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-lg space-y-3">

        {/* ═══ TABS + WEEK HEADER ═══ */}
        {(() => {
          const weekStart = new Date();
          const dayOfWeek = weekStart.getDay();
          weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          const fmtDay = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

          const pendingDecks = planDecks.filter((d: any) => (d.new_count ?? 0) + (d.review_count ?? 0) > 0);
          const doneDecks = planDecks.filter((d: any) => (d.new_count ?? 0) + (d.review_count ?? 0) === 0);
          const filteredDecks = activeTab === 'pending' ? pendingDecks : doneDecks;
          const completedCount = doneDecks.length;

          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'done')} className="flex-1">
                  <TabsList className="h-9 w-full">
                    <TabsTrigger value="pending" className="flex-1 text-xs">Para estudar</TabsTrigger>
                    <TabsTrigger value="done" className="flex-1 text-xs">Concluídos</TabsTrigger>
                  </TabsList>
                </Tabs>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  Semana: {fmtDay(weekStart)} a {fmtDay(weekEnd)}
                </span>
              </div>

              {/* Deck counter */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Baralhos da semana</h3>
                  <p className="text-xs text-muted-foreground">{completedCount} de {planDecks.length} concluídos</p>
                </div>
              </div>

              {/* ═══ HORIZONTAL DECK CAROUSEL ═══ */}
              {filteredDecks.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      {activeTab === 'pending' ? '🎉 Tudo concluído por hoje!' : 'Nenhum baralho concluído ainda.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 scrollbar-hide -mx-4 px-4">
                  {filteredDecks.map((deck: any) => (
                    <DeckStudyCard key={deck.id} deck={deck} avgSecondsPerCard={avgSecondsPerCard} />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* ═══ HERO CARD: Carga + Termômetro ═══ */}
        <Card className={cn('border', HERO_GRADIENT[healthStatus])}>
          <CardContent className="p-4 space-y-4">
            {metrics && (
              <StudyLoadBar
                estimatedMinutes={metrics.estimatedMinutesToday}
                capacityMinutes={todayCapacity}
                recommendedMinutes={metrics.requiredCardsPerDay != null ? Math.round((metrics.requiredCardsPerDay * metrics.avgSecondsPerCard) / 60) : null}
                reviewMin={metrics.reviewMinutes}
                newMin={metrics.newMinutes}
                capacityCards={metrics.capacityCardsToday}
                recommendedCards={metrics.requiredCardsPerDay}
              />
            )}

            {metrics && metrics.planHealthPercent != null && metrics.planHealthPercent < 80 && (
              <p className="text-xs text-center text-muted-foreground">
                Consistência: {metrics.planHealthPercent}% — estude hoje para melhorar!
              </p>
            )}

            {needsAttention && (
              <Button
                className="w-full"
                variant={healthStatus === 'red' ? 'destructive' : 'default'}
                onClick={() => {
                  if (metrics?.totalReview > 20) setShowCatchUp(true);
                  else setEditingMinutes(true);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {metrics?.totalReview > 20 ? 'Resolver Atraso' : 'Ajustar Plano'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ═══ WEEKLY CARD CHART ═══ */}
        {metrics?.weeklyCardData && (
          <Card>
            <CardContent className="p-4">
              <WeeklyCardChart data={metrics.weeklyCardData} status={healthStatus} />
            </CardContent>
          </Card>
        )}

        {/* ═══ MEUS OBJETIVOS (compact) ═══ */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Meus Objetivos</h3>

            {/* Pilar 1: Data */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground">Data de conclusão</p>
                {editingDate ? (
                  <div className="space-y-2 mt-1">
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
                  <button onClick={() => setEditingDate(true)} className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1">
                    {plan.target_date
                      ? <>Terminar até {format(new Date(plan.target_date), "dd/MM/yyyy")} <span className="text-muted-foreground font-normal">({metrics?.daysRemaining ?? '?'} dias)</span></>
                      : 'Definir data'}
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Pilar 2: Retenção (editable) */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">Taxa de retenção desejada</p>
                {editingRetention ? (
                  <div className="space-y-2 mt-1">
                    <div className="text-center">
                      <span className="text-lg font-bold text-primary">{tempRetention}%</span>
                    </div>
                    <Slider
                      value={[tempRetention]}
                      onValueChange={([v]) => setTempRetention(v)}
                      min={70} max={99} step={1}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {tempRetention >= 95 ? '⚠️ Alta retenção = intervalos mais curtos = mais revisões' :
                       tempRetention <= 80 ? '💡 Retenção baixa = intervalos longos = menos revisões' :
                       '✅ Retenção equilibrada (recomendado: 85-92%)'}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveRetention}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingRetention(false); setTempRetention(Math.round((metrics?.avgRetention ?? 0.9) * 100)); }}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditingRetention(true)} className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1">
                    {Math.round((metrics?.avgRetention ?? 0.9) * 100)}% de Retenção
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Pilar 3: Capacidade (daily or weekly) */}
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">Capacidade de estudo</p>
                {editingMinutes || editingWeekly ? (
                  <div className="space-y-3 mt-1">
                    {/* Toggle between daily/weekly */}
                    <div className="flex gap-1">
                      <Button
                        size="sm" variant={!editingWeekly ? 'default' : 'outline'}
                        className="h-7 text-xs flex-1"
                        onClick={() => setEditingWeekly(false)}
                      >
                        Igual todo dia
                      </Button>
                      <Button
                        size="sm" variant={editingWeekly ? 'default' : 'outline'}
                        className="h-7 text-xs flex-1"
                        onClick={() => setEditingWeekly(true)}
                      >
                        Por dia da semana
                      </Button>
                    </div>

                    {editingWeekly ? (
                      /* Weekly editor */
                      <div className="space-y-2">
                        {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(day => (
                          <div key={day} className="flex items-center gap-2">
                            <span className="text-xs font-medium w-8 text-muted-foreground">{DAY_LABELS[day]}</span>
                            <Slider
                              value={[tempWeekly[day]]}
                              onValueChange={([v]) => setTempWeekly(prev => ({ ...prev, [day]: v }))}
                              min={0} max={240} step={15}
                              className="flex-1"
                            />
                            <span className="text-xs font-semibold w-12 text-right">{formatMinutes(tempWeekly[day])}</span>
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground text-center">
                          Média: {formatMinutes(Math.round(Object.values(tempWeekly).reduce((a, b) => a + b, 0) / 7))}/dia
                        </p>
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={handleSaveWeekly}>Salvar</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingWeekly(false); setEditingMinutes(false); }}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      /* Daily editor */
                      <div className="space-y-2">
                        <div className="text-center">
                          <span className="text-lg font-bold text-primary">{formatMinutes(tempMinutes)}</span>
                        </div>
                        <Slider
                          value={[tempMinutes]}
                          onValueChange={([v]) => setTempMinutes(v)}
                          min={15} max={240} step={15}
                        />
                        {impactMessage && (
                          <div className={cn(
                            'rounded-lg px-3 py-1.5 text-xs',
                            impactMessage.tone === 'warning' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
                            impactMessage.tone === 'success' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                            impactMessage.tone === 'neutral' && 'bg-muted text-muted-foreground',
                          )}>
                            {impactMessage.text}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={handleSaveMinutes}>Salvar</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingMinutes(false); setTempMinutes(plan.daily_minutes); }}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => { setEditingMinutes(true); setEditingWeekly(isUsingWeekly); }} className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1">
                    {isUsingWeekly ? (
                      <>Hoje: {formatMinutes(todayCapacity)} <span className="text-muted-foreground font-normal">(média {formatMinutes(getWeeklyAvgMinutes(plan))}/dia)</span></>
                    ) : (
                      <>{formatMinutes(plan.daily_minutes)}/dia <span className="text-muted-foreground font-normal">({metrics?.cardsPerDay ?? '?'} cards/dia)</span></>
                    )}
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Coverage Progress + projected completion */}
            {metrics && (
              <div className="pt-3 border-t space-y-2">
                {plan.target_date && metrics.coveragePercent != null && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Cobertura</span>
                      <span className="font-semibold">{metrics.coveragePercent}%</span>
                    </div>
                    <Progress value={metrics.coveragePercent} className="h-2" />
                    <div className="space-y-0.5">
                      {metrics.requiredCardsPerDay != null && (
                        <p className="text-[11px] text-muted-foreground">
                          📊 Sistema recomenda: <strong>{metrics.requiredCardsPerDay} cards/dia</strong> para 100% até a meta
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        🎯 Sua capacidade: <strong>{metrics.capacityCardsToday} cards/dia</strong>
                        {metrics.coveragePercent > 100 && ' — você terminará antes da data!'}
                      </p>
                    </div>
                    {metrics.coveragePercent < 50 && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-1.5 text-xs">
                        Seu ritmo pode não ser suficiente. Considere aumentar o tempo diário.
                      </div>
                    )}
                  </>
                )}
                {metrics.projectedCompletionDate && (
                  <p className="text-[11px] text-muted-foreground">
                    📅 Previsão de conclusão: <strong>{format(new Date(metrics.projectedCompletionDate), "dd/MM/yyyy")}</strong>
                    {plan.target_date && metrics.coveragePercent != null && metrics.coveragePercent >= 100 && (
                      <span className="text-emerald-600 dark:text-emerald-400"> (antes da meta!)</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {!needsAttention && metrics && metrics.totalReview > 0 && (
          <Button variant="outline" className="w-full" onClick={() => setShowCatchUp(true)}>
            <RotateCcw className="h-4 w-4 mr-2" /> Limpar Atraso ({metrics.totalReview} revisões)
          </Button>
        )}
      </main>

      {/* ═══ DIALOGS ═══ */}
      <CatchUpDialog
        open={showCatchUp}
        onOpenChange={setShowCatchUp}
        totalReview={metrics?.totalReview ?? 0}
        avgSecondsPerCard={avgSecondsPerCard}
      />

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurações do Plano</DialogTitle>
            <DialogDescription>Editar ou excluir seu plano de estudos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Drag-and-drop reorder */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Prioridade dos Baralhos</h4>
              <p className="text-[10px] text-muted-foreground">Arraste para reordenar a prioridade de estudo.</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {displayItems.map((deck: any) => {
                  const handlers = getHandlers(deck);
                  return (
                    <div
                      key={deck.id}
                      {...handlers}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-xl border bg-card hover:bg-muted/30 transition-colors',
                        handlers.className
                      )}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
                      <p className="text-sm font-medium truncate flex-1">{deck.name}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => { setShowSettings(false); onEdit(); }}>
                <Pencil className="h-4 w-4 mr-2" /> Editar plano completo
              </Button>
              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir plano
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Seu plano de estudos será permanentemente excluído.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => { setShowSettings(false); setShowDeleteConfirm(false); onDelete(); }}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            Você tem <strong>{totalReview}</strong> revisões pendentes. Escolha como diluir:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {options.map(days => {
            const extra = Math.ceil(totalReview / days);
            const extraMin = Math.round((extra * avgSecondsPerCard) / 60);
            return (
              <div key={days} className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30 transition-colors cursor-pointer">
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
            O sistema já prioriza revisões vencidas automaticamente. Use como referência.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudyPlan;
