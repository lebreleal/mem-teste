import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, GripVertical, Play, Pencil, Check, Info, Clock, TrendingUp, Timer, CheckCircle2, BarChart3, CalendarIcon, Layers, CalendarDays, Target, Plus } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { ForecastPoint, ForecastView, SimulatorSummary } from '@/types/forecast';
import type { WeeklyMinutes, DayKey } from '@/hooks/useStudyPlan';
import { DAY_LABELS } from '@/hooks/useStudyPlan';
import { formatMinutes, HEALTH_CONFIG } from './constants';

// ─── Health Ring SVG ────────────────────────────────────
export function HealthRing({ percent, status, size = 64 }: { percent: number; status: keyof typeof HEALTH_CONFIG; size?: number }) {
  const cfg = HEALTH_CONFIG[status];
  const r = size / 2;
  const stroke = size > 48 ? 5 : 4;
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
      <span className={cn('absolute font-bold', size > 48 ? 'text-sm' : 'text-xs')}>{cfg.icon}</span>
    </div>
  );
}

// ─── Study Load Bar (compact) ──────────────────────────
export function StudyLoadBar({ estimatedMinutes, capacityMinutes, reviewMin, newMin }: {
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
        <span className="text-xs text-muted-foreground">Tempo de estudo hoje</span>
        <span className="text-lg font-bold text-foreground">
          {estimatedMinutes === 0 ? 'Sem estudo hoje' : formatMinutes(estimatedMinutes)}
        </span>
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
      {estimatedMinutes === 0 ? (
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Nenhuma revisão pendente</p>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          {formatMinutes(reviewMin)} de revisões + {formatMinutes(newMin)} de cards novos — dentro do seu limite de {formatMinutes(capacityMinutes)}
        </p>
      )}
    </div>
  );
}

// ─── Progress Summary Card ──────────────────────────────
function ProgressSummaryCard({ data, summary, totalNewCards, plans }: {
  data: ForecastPoint[];
  summary: SimulatorSummary | null;
  totalNewCards: number;
  plans?: { id: string; name: string; target_date: string | null }[];
}) {
  // Calculate progress: how many new cards will be studied within the simulation horizon
  const totalNewInSim = data.reduce((s, d) => s + d.newCards, 0);
  const willStudy = Math.min(totalNewCards, totalNewInSim);
  const pct = totalNewCards > 0 ? Math.min(100, Math.round((willStudy / totalNewCards) * 100)) : 100;

  // Completion date: last simulation point where newCards > 0
  const lastNewDay = data.length > 0 ? [...data].reverse().find(d => d.newCards > 0) : null;
  const completionDateRaw = lastNewDay?.date ?? null;
  const completionDate = completionDateRaw ? formatCompletionDate(completionDateRaw) : null;

  // Target date comparison
  const earliestTarget = (plans ?? []).filter(p => p.target_date).reduce<Date | null>((min, p) => {
    const d = new Date(p.target_date!);
    return !min || d < min ? d : min;
  }, null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntilTarget = earliestTarget
    ? Math.max(0, Math.ceil((earliestTarget.getTime() - today.getTime()) / 86400000))
    : null;

  // Status determination
  let status: 'green' | 'yellow' | 'red' = 'green';
  let statusLabel = 'Em dia';
  let statusEmoji = '✓';

  if (earliestTarget && completionDate) {
    const completionParsed = parseSimDate(completionDate);
    if (completionParsed && completionParsed > earliestTarget) {
      status = 'red';
      statusLabel = 'Meta inviável';
      statusEmoji = '⚠';
    } else if (daysUntilTarget !== null && daysUntilTarget <= 7) {
      status = 'yellow';
      statusLabel = 'Meta apertada';
      statusEmoji = '!';
    }
  }

  if (totalNewCards === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Resumo do Progresso</h3>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              <strong className="text-foreground">{totalNewCards}</strong> cards novos para dominar
            </span>
            <span className="text-sm font-bold text-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2.5" />
        </div>

        {/* Completion date + status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {completionDate && (
            <p className="text-xs text-muted-foreground">
              Conclusão prevista: <strong className="text-foreground">{completionDate}</strong>
            </p>
          )}
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] h-5 px-2',
              status === 'green' && 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
              status === 'yellow' && 'border-amber-500/30 text-amber-600 dark:text-amber-400',
              status === 'red' && 'border-red-500/30 text-red-600 dark:text-red-400',
            )}
          >
            {statusEmoji} {statusLabel}
          </Badge>
        </div>

        {/* Summary stats */}
        {summary && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Média de <strong className="text-foreground">{formatMinutes(summary.avgDailyMin)}/dia</strong>.
            {summary.peakMin > summary.avgDailyMin * 1.2 && (
              <> Pico de <strong className="text-foreground">{formatMinutes(summary.peakMin)}</strong> em <strong className="text-foreground">{summary.peakDate}</strong>.</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to parse "dd/MM/yy" or "dd/MM/yyyy" or weekly range "dd/MM – dd/MM" dates from simulation
function parseSimDate(dateStr: string): Date | null {
  // Handle weekly aggregation format like "24/02 – 02/03"
  const cleanStr = dateStr.includes('–') ? dateStr.split('–')[1].trim() : dateStr;
  const parts = cleanStr.split('/');
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parts.length === 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

// Format completion date for display
function formatCompletionDate(dateStr: string): string {
  const parsed = parseSimDate(dateStr);
  if (!parsed || isNaN(parsed.getTime())) return dateStr;
  return format(parsed, "dd/MM/yyyy");
}

// ─── Simplified Chart Tooltip ──────────────────────────
function SimulatorTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ForecastPoint;
  if (!d) return null;

  const overAmount = d.totalMin - d.capacityMin;

  return (
    <div className="rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-md text-[11px] space-y-1.5 min-w-[160px]">
      <p className="font-semibold">{d.day} — {d.date}</p>
      <div className="h-px bg-border" />
      <p className="font-medium text-sm">{formatMinutes(d.totalMin)} de estudo</p>
      <p className="text-muted-foreground">
        {d.reviewCards} revisões · {d.newCards} novos · {d.learningCards + d.relearningCards} aprendendo
      </p>
      <div className="h-px bg-border" />
      <p className={cn('font-medium', d.overloaded ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
        Capacidade: {formatMinutes(d.capacityMin)} {d.overloaded ? `⚠ +${formatMinutes(overAmount)}` : '✓'}
      </p>
    </div>
  );
}

// ─── Simulation Controls Card ──────────────────────────
function SimulationControls({
  defaultNewCardsPerDay, newCardsOverride, onNewCardsChange,
  defaultCreatedCardsPerDay, createdCardsOverride, onCreatedCardsChange,
  realDailyMinutes, realWeeklyMinutes,
  dailyMinutesOverride, weeklyMinutesOverride,
  onDailyMinutesChange, onWeeklyMinutesChange,
  onApplyCapacity, hasAnyOverride, isSimulating,
  isUsingDefaults,
}: {
  defaultNewCardsPerDay: number;
  newCardsOverride: number | undefined;
  onNewCardsChange: (v: number | undefined) => void;
  defaultCreatedCardsPerDay: number;
  createdCardsOverride: number | undefined;
  onCreatedCardsChange: (v: number | undefined) => void;
  realDailyMinutes: number;
  realWeeklyMinutes: WeeklyMinutes | null;
  dailyMinutesOverride: number | undefined;
  weeklyMinutesOverride: WeeklyMinutes | undefined;
  onDailyMinutesChange: (v: number | undefined) => void;
  onWeeklyMinutesChange: (v: WeeklyMinutes | undefined) => void;
  onApplyCapacity: () => void;
  hasAnyOverride: boolean;
  isSimulating: boolean;
  isUsingDefaults: boolean;
}) {
  const [editingNewCards, setEditingNewCards] = useState(false);
  const [tempNewCards, setTempNewCards] = useState(String(newCardsOverride ?? defaultNewCardsPerDay));
  const [editingCreatedCards, setEditingCreatedCards] = useState(false);
  const [tempCreatedCards, setTempCreatedCards] = useState(String(createdCardsOverride ?? defaultCreatedCardsPerDay));
  const [editingCapacity, setEditingCapacity] = useState(false);

  const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const currentWeekly = weeklyMinutesOverride ?? realWeeklyMinutes ?? {
    mon: realDailyMinutes, tue: realDailyMinutes, wed: realDailyMinutes, thu: realDailyMinutes,
    fri: realDailyMinutes, sat: realDailyMinutes, sun: realDailyMinutes,
  };
  const currentAvgMin = Math.round(DAY_ORDER.reduce((s, d) => s + (currentWeekly[d] || 0), 0) / 7);
  const isCapacityOverridden = dailyMinutesOverride !== undefined || weeklyMinutesOverride !== undefined;

  const [tempWeekly, setTempWeekly] = useState<WeeklyMinutes>(currentWeekly);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Ajustes da Simulação</h3>
        </div>

        {isUsingDefaults && (
          <div className="flex items-center gap-2 text-[10px] text-primary">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Baseado em estimativas iniciais. Conforme você estuda, o algoritmo ajusta automaticamente.</span>
          </div>
        )}

        {/* New cards per day */}
        <ControlRow
          icon={<Layers className="h-3 w-3" />}
          label="cards novos para estudar/dia"
          value={newCardsOverride ?? defaultNewCardsPerDay}
          defaultValue={defaultNewCardsPerDay}
          editing={editingNewCards}
          tempValue={tempNewCards}
          onEdit={() => { setTempNewCards(String(newCardsOverride ?? defaultNewCardsPerDay)); setEditingNewCards(true); }}
          onTempChange={setTempNewCards}
          onConfirm={() => {
            const val = parseInt(tempNewCards, 10);
            if (!isNaN(val) && val >= 0) onNewCardsChange(val === defaultNewCardsPerDay ? undefined : val);
            setEditingNewCards(false);
          }}
          onReset={() => { onNewCardsChange(undefined); setEditingNewCards(false); }}
          isOverridden={newCardsOverride != null}
        />

        {/* Created cards per day */}
        <ControlRow
          icon={<Plus className="h-3 w-3" />}
          label="cards criados/dia"
          value={createdCardsOverride ?? defaultCreatedCardsPerDay}
          defaultValue={defaultCreatedCardsPerDay}
          editing={editingCreatedCards}
          tempValue={tempCreatedCards}
          onEdit={() => { setTempCreatedCards(String(createdCardsOverride ?? defaultCreatedCardsPerDay)); setEditingCreatedCards(true); }}
          onTempChange={setTempCreatedCards}
          onConfirm={() => {
            const val = parseInt(tempCreatedCards, 10);
            if (!isNaN(val) && val >= 0) onCreatedCardsChange(val === defaultCreatedCardsPerDay ? undefined : val);
            setEditingCreatedCards(false);
          }}
          onReset={() => { onCreatedCardsChange(undefined); setEditingCreatedCards(false); }}
          isOverridden={createdCardsOverride != null}
        />

        {/* Study time */}
        <div className="flex items-center gap-2 text-xs">
          <Timer className="h-3 w-3 text-muted-foreground" />
          <button
            onClick={() => { setTempWeekly(currentWeekly); setEditingCapacity(true); }}
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <span className="font-medium text-foreground">Tempo de estudo diário</span>
            <span className="text-muted-foreground">(média {currentAvgMin}min)</span>
            <Pencil className="h-3 w-3 text-muted-foreground/50" />
            {isCapacityOverridden && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1 border-primary/40 text-primary">simulando</Badge>
            )}
          </button>
        </div>

        {/* Capacity edit modal */}
        <Dialog open={editingCapacity} onOpenChange={setEditingCapacity}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Timer className="h-4 w-4 text-primary" />
                Tempo de Estudo Diário
              </DialogTitle>
              <DialogDescription>
                Defina quanto tempo estudar em cada dia da semana. Coloque 0 para dias de folga.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                {DAY_ORDER.map(dk => (
                  <div key={dk} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-8 text-muted-foreground">{DAY_LABELS[dk]}</span>
                    <Slider
                      value={[tempWeekly[dk]]}
                      onValueChange={([v]) => setTempWeekly(prev => ({ ...prev, [dk]: v }))}
                      min={0} max={240} step={15}
                      className="flex-1"
                    />
                    <span className={cn("text-xs font-semibold w-10 text-right", tempWeekly[dk] === 0 && "text-muted-foreground")}>
                      {tempWeekly[dk] === 0 ? 'Folga' : formatMinutes(tempWeekly[dk])}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Média: <span className="font-semibold text-foreground">{Math.round(DAY_ORDER.reduce((s, d) => s + (tempWeekly[d] || 0), 0) / 7)}min/dia</span>
              </p>
              <Button className="w-full" onClick={() => {
                onWeeklyMinutesChange(tempWeekly);
                const avg = Math.round(DAY_ORDER.reduce((s, d) => s + (tempWeekly[d] || 0), 0) / 7);
                onDailyMinutesChange(avg === realDailyMinutes ? undefined : avg);
                setEditingCapacity(false);
              }}>
                <Check className="h-4 w-4 mr-1.5" /> Aplicar na simulação
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Apply button */}
        {hasAnyOverride && !isSimulating && (
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onApplyCapacity}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar ao meu plano
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Control Row (reusable inline editor) ──────────────
function ControlRow({ icon, label, value, defaultValue, editing, tempValue, onEdit, onTempChange, onConfirm, onReset, isOverridden }: {
  icon: React.ReactNode; label: string; value: number; defaultValue: number;
  editing: boolean; tempValue: string;
  onEdit: () => void; onTempChange: (v: string) => void; onConfirm: () => void; onReset: () => void;
  isOverridden: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{icon}</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="number" min={0} max={9999}
            value={tempValue}
            onChange={e => onTempChange(e.target.value)}
            className="h-6 w-16 text-xs px-1.5"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && onConfirm()}
          />
          <span className="text-muted-foreground">{label}</span>
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onConfirm}>
            <Check className="h-3 w-3" />
          </Button>
          {isOverridden && (
            <button onClick={onReset} className="text-[10px] text-primary underline">reset</button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button onClick={onEdit} className="flex items-center gap-1 hover:text-primary transition-colors">
            <span className="font-medium text-foreground">{value}</span>
            <span className="text-muted-foreground">{label}</span>
            <Pencil className="h-3 w-3 text-muted-foreground/50" />
          </button>
          {isOverridden && (
            <>
              <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/40 text-primary">simulando</Badge>
              <button onClick={onReset} className="text-[10px] text-primary underline">reset</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Forecast Simulator (refactored: 3 blocks) ─────────

const VIEW_OPTIONS: { value: ForecastView; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '365d', label: '1 ano' },
];

export function ForecastSimulator({
  data, summary, isSimulating, progress, defaultNewCardsPerDay,
  forecastView, onViewChange, newCardsOverride, onNewCardsChange,
  hasTargetDate, plans: plansList, customTargetDate, onCustomTargetDate, isUsingDefaults,
  totalNewCards, defaultCreatedCardsPerDay, createdCardsOverride, onCreatedCardsChange,
  realDailyMinutes, realWeeklyMinutes,
  dailyMinutesOverride, weeklyMinutesOverride,
  onDailyMinutesChange, onWeeklyMinutesChange,
  onApplyCapacity, hasAnyOverride,
}: {
  data: ForecastPoint[];
  summary: SimulatorSummary | null;
  isSimulating: boolean;
  progress: number;
  defaultNewCardsPerDay: number;
  forecastView: ForecastView;
  onViewChange: (v: ForecastView) => void;
  newCardsOverride: number | undefined;
  onNewCardsChange: (v: number | undefined) => void;
  hasTargetDate: boolean;
  plans?: { id: string; name: string; target_date: string | null }[];
  customTargetDate?: Date | null;
  onCustomTargetDate?: (d: Date | null) => void;
  isUsingDefaults: boolean;
  totalNewCards: number;
  defaultCreatedCardsPerDay: number;
  createdCardsOverride: number | undefined;
  onCreatedCardsChange: (v: number | undefined) => void;
  realDailyMinutes: number;
  realWeeklyMinutes: WeeklyMinutes | null;
  dailyMinutesOverride: number | undefined;
  weeklyMinutesOverride: WeeklyMinutes | undefined;
  onDailyMinutesChange: (v: number | undefined) => void;
  onWeeklyMinutesChange: (v: WeeklyMinutes | undefined) => void;
  onApplyCapacity: () => void;
  hasAnyOverride: boolean;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const options = [...VIEW_OPTIONS, { value: 'target' as ForecastView, label: 'Escolher data' }];
  const plansWithDate = (plansList ?? []).filter(p => p.target_date);

  const avgCapacity = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.capacityMin, 0) / data.length) : 0;

  // Prepare chart data with withinCapacity and overCapacity
  const chartData = data.map(d => ({
    ...d,
    withinCapacity: Math.min(d.totalMin, d.capacityMin),
    overCapacity: Math.max(0, d.totalMin - d.capacityMin),
  }));

  return (
    <div className="space-y-3">

      {/* Block 2: Chart */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Carga Diária Prevista</h3>
          </div>

          {/* View chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  if (opt.value === 'target') {
                    setShowDatePicker(true);
                  } else {
                    onViewChange(opt.value);
                  }
                }}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border',
                  forecastView === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                )}
              >
                {opt.value === 'target' && forecastView === 'target' && customTargetDate
                  ? format(customTargetDate, "dd/MM/yy")
                  : opt.label}
              </button>
            ))}
          </div>

          {/* Simulation progress */}
          {isSimulating && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1" />
              <p className="text-[10px] text-muted-foreground text-center">Simulando... {progress}%</p>
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && !isSimulating && (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} barGap={0} barCategoryGap="15%">
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  tickFormatter={(v) => `${v}min`}
                  domain={[0, (max: number) => Math.ceil(max * 1.15)]}
                />
                <Tooltip content={<SimulatorTooltip />} />
                {avgCapacity > 0 && (
                  <ReferenceLine
                    y={avgCapacity}
                    stroke="hsl(var(--muted-foreground) / 0.4)"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{
                      value: `${avgCapacity}m`,
                      position: 'right',
                      fontSize: 9,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                  />
                )}
                {/* Two stacked bars: within capacity (blue) + over capacity (red) */}
                <Bar
                  dataKey="withinCapacity"
                  stackId="load"
                  name="Dentro da capacidade"
                  fill="hsl(217 91% 60%)"
                  opacity={0.8}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="overCapacity"
                  stackId="load"
                  name="Excedente"
                  fill="hsl(0 84% 60%)"
                  opacity={0.75}
                  radius={[3, 3, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Mini-legend */}
          {chartData.length > 0 && !isSimulating && (
            <div className="flex items-center gap-4 justify-center text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[hsl(217_91%_60%)] opacity-80" /> Dentro da capacidade
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[hsl(0_84%_60%)] opacity-75" /> Excedente
              </span>
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 border-t border-dashed border-muted-foreground/40" /> Média
              </span>
            </div>
          )}

          {/* Empty state */}
          {data.length === 0 && !isSimulating && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Nenhum dado para simular. Adicione baralhos aos seus objetivos.
            </div>
          )}

          {/* Date picker dialog */}
          <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Escolher data
                </DialogTitle>
                <DialogDescription>
                  Simule a carga de estudos até uma data específica.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                {plansWithDate.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Datas dos objetivos</p>
                    {plansWithDate.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          const d = new Date(p.target_date!);
                          onCustomTargetDate?.(d);
                          onViewChange('target');
                          setShowDatePicker(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {format(new Date(p.target_date!), "dd/MM/yyyy")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Data personalizada</p>
                  <Calendar
                    mode="single"
                    selected={customTargetDate ?? undefined}
                    onSelect={(d) => {
                      if (d) {
                        onCustomTargetDate?.(d);
                        onViewChange('target');
                        setShowDatePicker(false);
                      }
                    }}
                    disabled={(date) => date < new Date()}
                    className={cn("p-3 pointer-events-auto rounded-lg border")}
                    locale={ptBR}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Block 3: Simulation Controls */}
      <SimulationControls
        defaultNewCardsPerDay={defaultNewCardsPerDay}
        newCardsOverride={newCardsOverride}
        onNewCardsChange={onNewCardsChange}
        defaultCreatedCardsPerDay={defaultCreatedCardsPerDay}
        createdCardsOverride={createdCardsOverride}
        onCreatedCardsChange={onCreatedCardsChange}
        realDailyMinutes={realDailyMinutes}
        realWeeklyMinutes={realWeeklyMinutes}
        dailyMinutesOverride={dailyMinutesOverride}
        weeklyMinutesOverride={weeklyMinutesOverride}
        onDailyMinutesChange={onDailyMinutesChange}
        onWeeklyMinutesChange={onWeeklyMinutesChange}
        onApplyCapacity={onApplyCapacity}
        hasAnyOverride={hasAnyOverride}
        isSimulating={isSimulating}
        isUsingDefaults={isUsingDefaults}
      />
    </div>
  );
}

// ─── Compact Deck Row ─────────────────────────────────
export const CompactDeckRow = React.forwardRef<HTMLDivElement, {
  deck: any; avgSecondsPerCard: number; handlers?: any; showGrip?: boolean;
}>(({ deck, avgSecondsPerCard, handlers, showGrip = true }, ref) => {
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
      ref={ref}
      {...(handlers ?? {})}
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-xl border bg-card transition-all',
        handlers?.className,
        pending === 0 && 'opacity-60'
      )}
    >
      {showGrip && (
        <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
      )}
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
});
CompactDeckRow.displayName = 'CompactDeckRow';
