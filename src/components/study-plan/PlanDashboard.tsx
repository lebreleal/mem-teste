import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarIcon, Clock, Brain, Pencil, Trash2,
  RotateCcw, ChevronRight, Settings2, GripVertical, Play, Plus, AlertTriangle,
} from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getMinutesForDay, getWeeklyAvgMinutes, DAY_LABELS, type DayKey, type WeeklyMinutes, type PlanMetrics, type ForecastDataPoint } from '@/hooks/useStudyPlan';
import { formatMinutes, HEALTH_CONFIG, HERO_GRADIENT, SLIDER_MARKS } from './constants';
import BottomNav from '@/components/BottomNav';

// ─── Health Ring SVG ────────────────────────────────────
function HealthRing({ percent, status }: { percent: number; status: keyof typeof HEALTH_CONFIG }) {
  const cfg = HEALTH_CONFIG[status];
  const r = 32;
  const stroke = 5;
  const nr = r - stroke / 2;
  const circ = nr * 2 * Math.PI;
  const offset = circ - (Math.min(100, Math.max(0, percent)) / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg height={r * 2} width={r * 2} className="-rotate-90">
        <circle stroke="hsl(var(--muted))" fill="transparent" strokeWidth={stroke} r={nr} cx={r} cy={r} />
        <circle
          className={cn('transition-all duration-700', cfg.ring)}
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          r={nr} cx={r} cy={r}
        />
      </svg>
      <span className="absolute text-sm font-bold">{cfg.icon}</span>
    </div>
  );
}

// ─── Study Load Bar (compact) ──────────────────────────
function StudyLoadBar({ estimatedMinutes, capacityMinutes, reviewMin, newMin }: {
  estimatedMinutes: number; capacityMinutes: number; reviewMin: number; newMin: number;
}) {
  const maxDisplay = Math.max(capacityMinutes * 2, 100);
  const percent = Math.min(100, (estimatedMinutes / maxDisplay) * 100);
  const g = (capacityMinutes * 0.7 / maxDisplay) * 100;
  const y = (capacityMinutes / maxDisplay) * 100;
  const o = (capacityMinutes * 1.5 / maxDisplay) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Carga de hoje</span>
        <span className="text-lg font-bold text-foreground">{formatMinutes(estimatedMinutes)}</span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden bg-muted">
        <div className="absolute inset-0 flex">
          <div className="bg-emerald-400/50" style={{ width: `${g}%` }} />
          <div className="bg-amber-400/50" style={{ width: `${y - g}%` }} />
          <div className="bg-orange-400/50" style={{ width: `${o - y}%` }} />
          <div className="bg-red-400/50" style={{ width: `${100 - o}%` }} />
        </div>
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground rounded-full shadow transition-all duration-500"
          style={{ left: `${Math.min(percent, 99)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        {formatMinutes(reviewMin)} revisões + {formatMinutes(newMin)} novos
      </p>
    </div>
  );
}

// ─── Forecast Chart ─────────────────────────────────────
function ForecastChart({ data }: { data: ForecastDataPoint[] }) {
  const hasOverload = data.some(d => d.overloaded);
  const overloadedDays = data.filter(d => d.overloaded);
  const maxCapacity = Math.max(...data.map(d => d.capacityMin));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Previsão de Carga (7 dias)</h3>
          {hasOverload && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={data} barGap={1}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={30}
              tickFormatter={(v) => `${v}m`}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
              formatter={(value: number, name: string) => [
                `${value}min`,
                name === 'reviewMin' ? 'Revisões' : 'Novos',
              ]}
            />
            <ReferenceLine
              y={maxCapacity}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <Bar dataKey="reviewMin" stackId="a" name="reviewMin" radius={[0, 0, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.overloaded ? 'hsl(0 72% 51%)' : 'hsl(var(--primary))'}
                  opacity={entry.overloaded ? 0.85 : 1}
                />
              ))}
            </Bar>
            <Bar dataKey="newMin" stackId="a" name="newMin" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.overloaded ? 'hsl(0 72% 65%)' : 'hsl(142 71% 45%)'}
                  opacity={entry.overloaded ? 0.7 : 1}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-primary inline-block" /> Revisões
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: 'hsl(142 71% 45%)' }} /> Novos
          </span>
          <span className="flex items-center gap-1">
            <span className="h-px w-3 border-t border-dashed border-muted-foreground inline-block" /> Capacidade
          </span>
        </div>
        {overloadedDays.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-1.5 text-[11px]">
            ⚠️ Pico de carga previsto para{' '}
            <strong>{overloadedDays.map(d => d.day).join(', ')}</strong>{' '}
            ({formatMinutes(Math.max(...overloadedDays.map(d => d.totalMin)))}). Considere ajustar capacidade ou reduzir novos cards.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Compact Deck Row ─────────────────────────────────
function CompactDeckRow({ deck, avgSecondsPerCard, handlers }: { deck: any; avgSecondsPerCard: number; handlers: any }) {
  const navigate = useNavigate();
  const newAvail = Math.max(0, Math.min((deck.daily_new_limit ?? 20) - (deck.new_graduated_today ?? 0), deck.new_count ?? 0));
  const reviewCards = deck.review_count ?? 0;
  const learningCards = deck.learning_count ?? 0;
  const pending = newAvail + reviewCards + learningCards;
  const studied = deck.reviewed_today ?? 0;
  const total = pending + studied;
  const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
  const est = Math.round((pending * avgSecondsPerCard) / 60);

  return (
    <div
      {...handlers}
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-xl border bg-card transition-all',
        handlers.className,
        pending === 0 && 'opacity-60'
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{deck.name}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            {pending > 0 ? (
              <>
                <span className="text-[10px] text-muted-foreground">{formatMinutes(est)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); navigate(`/study/${deck.id}`); }}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">✓</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <Progress value={pct} className="h-1 flex-1" />
          <span className="text-[9px] text-muted-foreground w-8 text-right">{pct}%</span>
        </div>
      </div>
    </div>
  );
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
// ─── MAIN PLAN DASHBOARD ────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface PlanDashboardProps {
  plan: any;
  plans: any[];
  metrics: PlanMetrics | null;
  decks: any[];
  avgSecondsPerCard: number;
  calcImpact: (m: number) => any;
  isPremium: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdatePlan: (input: any) => Promise<void>;
  onSelectPlan: (id: string) => Promise<void>;
  onNewPlan: () => void;
  onEditPlan: (p: any) => void;
}

export function PlanDashboard({ plan, plans, metrics, decks, avgSecondsPerCard, calcImpact, isPremium, onEdit, onDelete, onUpdatePlan, onSelectPlan, onNewPlan }: PlanDashboardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Editing states
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
  const isUsingWeekly = !!plan.weekly_minutes;

  const planDecks = useMemo(() => {
    const ids = plan.deck_ids ?? [];
    return ids.map((id: string) => decks.find(d => d.id === id)).filter(Boolean);
  }, [plan.deck_ids, decks]);

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

    // Add peak forecast warning
    if (impact.peakDay && impact.peakMin > 0) {
      text += ` · Pico de ${formatMinutes(impact.peakMin)} previsto para ${impact.peakDay}`;
      if (tone !== 'warning') tone = 'warning';
    }

    return { text, tone };
  }, [editingMinutes, tempMinutes, calcImpact]);

  const handleSaveMinutes = async () => {
    try {
      await onUpdatePlan({ daily_minutes: tempMinutes, weekly_minutes: null });
      toast({ title: 'Tempo atualizado!' });
      setEditingMinutes(false);
    } catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  const handleSaveWeekly = async () => {
    try {
      const avg = Math.round(Object.values(tempWeekly).reduce((a, b) => a + b, 0) / 7);
      await onUpdatePlan({ daily_minutes: avg, weekly_minutes: tempWeekly });
      toast({ title: 'Horário semanal salvo!' });
      setEditingWeekly(false);
      setEditingMinutes(false);
    } catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  const handleSaveDate = async () => {
    try {
      await onUpdatePlan({ target_date: tempDate ? format(tempDate, 'yyyy-MM-dd') : null });
      toast({ title: 'Data atualizada!' });
      setEditingDate(false);
    } catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  const handleSaveRetention = async () => {
    try {
      const deckIds = plan.deck_ids ?? [];
      const retention = tempRetention / 100;
      for (const id of deckIds) {
        await supabase.from('decks').update({ requested_retention: retention }).eq('id', id);
      }
      toast({ title: 'Retenção atualizada!' });
      setEditingRetention(false);
    } catch { toast({ title: 'Erro ao atualizar', variant: 'destructive' }); }
  };

  // Health ring percent: use coverage or health-based
  const ringPercent = metrics?.coveragePercent ?? (
    metrics ? Math.min(100, Math.round((metrics.planHealthPercent ?? 80))) : 50
  );

  // Separate pending/done decks
  const pendingDecks = planDecks.filter((d: any) => (d.new_count ?? 0) + (d.review_count ?? 0) + (d.learning_count ?? 0) > 0);
  const doneDecks = planDecks.filter((d: any) => (d.new_count ?? 0) + (d.review_count ?? 0) + (d.learning_count ?? 0) === 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          {plans.length > 1 ? (
            <Select value={plan.id} onValueChange={(id) => onSelectPlan(id)}>
              <SelectTrigger className="h-auto border-0 bg-transparent p-0 shadow-none font-display text-lg font-bold [&>svg]:ml-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name || 'Meu Plano'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <h1 className="font-display text-lg font-bold truncate">{plan.name || 'Meu Plano de Estudos'}</h1>
          )}
        </div>
        {(isPremium || plans.length === 0) && (
          <Button variant="ghost" size="icon" onClick={onNewPlan} title="Novo plano">
            <Plus className="h-5 w-5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
          <Settings2 className="h-5 w-5" />
        </Button>
      </header>

      <main className="container mx-auto px-4 py-3 max-w-lg space-y-3">

        {/* ═══ 1. HERO CARD ═══ */}
        <Card className={cn('border', HERO_GRADIENT[healthStatus])}>
          <CardContent className="p-4 space-y-3">
            {/* Ring + Status + Load */}
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
                  {metrics?.planHealthPercent != null && metrics.planHealthPercent < 80 && (
                    <span className="text-[10px] text-muted-foreground">
                      Consistência: {metrics.planHealthPercent}%
                    </span>
                  )}
                </div>
                {metrics && (
                  <StudyLoadBar
                    estimatedMinutes={metrics.estimatedMinutesToday}
                    capacityMinutes={todayCapacity}
                    reviewMin={metrics.reviewMinutes}
                    newMin={metrics.newMinutes}
                  />
                )}
              </div>
            </div>

            {/* Adjust button */}
            {needsAttention && (
              <Button
                className="w-full"
                size="sm"
                variant={healthStatus === 'red' ? 'destructive' : 'default'}
                onClick={() => {
                  if (metrics?.totalReview && metrics.totalReview > 20) setShowCatchUp(true);
                  else setEditingMinutes(true);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {metrics?.totalReview && metrics.totalReview > 20 ? 'Resolver Atraso' : 'Ajustar Plano'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ═══ 2. MEUS OBJETIVOS (compact 3 pillars) ═══ */}
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Meus Objetivos</h3>

            {/* Pilar 1: Data */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <CalendarIcon className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                {editingDate ? (
                  <div className="space-y-1.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn('w-full justify-start text-left text-xs h-7', !tempDate && 'text-muted-foreground')}>
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {tempDate ? format(tempDate, "dd/MM/yyyy") : 'Sem data'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={tempDate} onSelect={setTempDate} disabled={(d) => d < new Date()} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveDate}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setEditingDate(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditingDate(true)} className="text-xs font-semibold hover:text-primary transition-colors flex items-center gap-1 w-full text-left">
                    {plan.target_date
                      ? <>{format(new Date(plan.target_date), "dd/MM/yyyy")} <span className="text-muted-foreground font-normal">({metrics?.daysRemaining ?? '?'} dias)</span></>
                      : <span className="text-muted-foreground">Definir data</span>}
                    <Pencil className="h-2.5 w-2.5 text-muted-foreground ml-auto shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* Pilar 2: Retenção */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <Brain className="h-3.5 w-3.5 text-purple-500" />
              </div>
              <div className="flex-1">
                {editingRetention ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary">{tempRetention}%</span>
                      <Slider value={[tempRetention]} onValueChange={([v]) => setTempRetention(v)} min={70} max={99} step={1} className="flex-1" />
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      {tempRetention >= 95 ? '⚠️ Alta = mais revisões' : tempRetention <= 80 ? '💡 Baixa = menos revisões' : '✅ Equilibrada (85-92%)'}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveRetention}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setEditingRetention(false); setTempRetention(Math.round((metrics?.avgRetention ?? 0.9) * 100)); }}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEditingRetention(true)} className="text-xs font-semibold hover:text-primary transition-colors flex items-center gap-1 w-full text-left">
                    {Math.round((metrics?.avgRetention ?? 0.9) * 100)}% retenção
                    <Pencil className="h-2.5 w-2.5 text-muted-foreground ml-auto shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* Pilar 3: Capacidade */}
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="flex-1">
                {editingMinutes || editingWeekly ? (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant={!editingWeekly ? 'default' : 'outline'} className="h-6 text-[10px] flex-1" onClick={() => setEditingWeekly(false)}>
                        Igual todo dia
                      </Button>
                      <Button size="sm" variant={editingWeekly ? 'default' : 'outline'} className="h-6 text-[10px] flex-1" onClick={() => setEditingWeekly(true)}>
                        Por dia
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
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setEditingWeekly(false); setEditingMinutes(false); }}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">{formatMinutes(tempMinutes)}</span>
                          <Slider value={[tempMinutes]} onValueChange={([v]) => setTempMinutes(v)} min={15} max={240} step={15} className="flex-1" />
                        </div>
                        {impactMessage && (
                          <div className={cn(
                            'rounded-lg px-2.5 py-1 text-[10px]',
                            impactMessage.tone === 'warning' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
                            impactMessage.tone === 'success' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                            impactMessage.tone === 'neutral' && 'bg-muted text-muted-foreground',
                          )}>
                            {impactMessage.text}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSaveMinutes}>Salvar</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setEditingMinutes(false); setTempMinutes(plan.daily_minutes); }}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => { setEditingMinutes(true); setEditingWeekly(isUsingWeekly); }} className="text-xs font-semibold hover:text-primary transition-colors flex items-center gap-1 w-full text-left">
                    {isUsingWeekly ? (
                      <>{formatMinutes(todayCapacity)} hoje <span className="text-muted-foreground font-normal">(média {formatMinutes(getWeeklyAvgMinutes(plan))}/dia)</span></>
                    ) : (
                      <>{formatMinutes(plan.daily_minutes)}/dia <span className="text-muted-foreground font-normal">({metrics?.cardsPerDay ?? '?'} cards)</span></>
                    )}
                    <Pencil className="h-2.5 w-2.5 text-muted-foreground ml-auto shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* Coverage + Projected */}
            {metrics && (
              <div className="pt-2 border-t space-y-1.5">
                {plan.target_date && metrics.coveragePercent != null && (
                  <>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Cobertura da meta</span>
                      <span className="font-semibold">{metrics.coveragePercent}%</span>
                    </div>
                    <Progress value={metrics.coveragePercent} className="h-1.5" />
                  </>
                )}
                {metrics.projectedCompletionDate && (
                  <p className="text-[10px] text-muted-foreground">
                    📅 Conclusão estimada: <strong>{format(new Date(metrics.projectedCompletionDate), "dd/MM/yyyy")}</strong>
                    {plan.target_date && metrics.coveragePercent != null && metrics.coveragePercent >= 100 && (
                      <span className="text-emerald-600 dark:text-emerald-400"> (antes da meta!)</span>
                    )}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ 3. FORECAST CHART ═══ */}
        {metrics?.forecastData && metrics.forecastData.length > 0 && (
          <ForecastChart data={metrics.forecastData} />
        )}

        {/* ═══ 4. DECK LIST ═══ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Baralhos ({doneDecks.length}/{planDecks.length} concluídos)
            </h3>
          </div>

          {pendingDecks.length > 0 && (
            <div className="space-y-1.5">
              {displayItems
                .filter((d: any) => (d.new_count ?? 0) + (d.review_count ?? 0) + (d.learning_count ?? 0) > 0)
                .map((deck: any) => (
                  <CompactDeckRow
                    key={deck.id}
                    deck={deck}
                    avgSecondsPerCard={avgSecondsPerCard}
                    handlers={getHandlers(deck)}
                  />
                ))}
            </div>
          )}

          {doneDecks.length > 0 && (
            <div className="space-y-1.5 opacity-60">
              {displayItems
                .filter((d: any) => (d.new_count ?? 0) + (d.review_count ?? 0) + (d.learning_count ?? 0) === 0)
                .map((deck: any) => (
                  <CompactDeckRow
                    key={deck.id}
                    deck={deck}
                    avgSecondsPerCard={avgSecondsPerCard}
                    handlers={getHandlers(deck)}
                  />
                ))}
            </div>
          )}

          {planDecks.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Nenhum baralho no plano.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Clear backlog button */}
        {!needsAttention && metrics && metrics.totalReview > 0 && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCatchUp(true)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Limpar Atraso ({metrics.totalReview} revisões)
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
            <DialogDescription>Gerenciar "{plan.name || 'Meu Plano'}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Prioridade dos Baralhos</h4>
              <p className="text-[10px] text-muted-foreground">Arraste para reordenar a prioridade.</p>
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
                      Esta ação não pode ser desfeita. O plano "{plan.name}" será permanentemente excluído.
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
