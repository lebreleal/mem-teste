import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, GripVertical, Play, Pencil, Check, Info, Clock, TrendingUp, Timer, CheckCircle2, BarChart3, CalendarIcon, Layers, CalendarDays } from 'lucide-react';
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

// ─── Forecast Simulator ─────────────────────────────────

const VIEW_OPTIONS: { value: ForecastView; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '365d', label: '1 ano' },
];

const DAY_ORDER: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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
  const [editingNewCards, setEditingNewCards] = useState(false);
  const [tempNewCards, setTempNewCards] = useState(String(newCardsOverride ?? defaultNewCardsPerDay));
  const [editingCreatedCards, setEditingCreatedCards] = useState(false);
  const [tempCreatedCards, setTempCreatedCards] = useState(String(createdCardsOverride ?? defaultCreatedCardsPerDay));
  const [overloadDialogDay, setOverloadDialogDay] = useState<ForecastPoint | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Capacity editing state
  const [editingCapacity, setEditingCapacity] = useState(false);
  const [tempWeekly, setTempWeekly] = useState<WeeklyMinutes>(
    weeklyMinutesOverride ?? realWeeklyMinutes ?? { mon: realDailyMinutes, tue: realDailyMinutes, wed: realDailyMinutes, thu: realDailyMinutes, fri: realDailyMinutes, sat: realDailyMinutes, sun: realDailyMinutes }
  );
  
  const currentWeekly = weeklyMinutesOverride ?? realWeeklyMinutes ?? { mon: realDailyMinutes, tue: realDailyMinutes, wed: realDailyMinutes, thu: realDailyMinutes, fri: realDailyMinutes, sat: realDailyMinutes, sun: realDailyMinutes };
  const currentAvgMin = Math.round(DAY_ORDER.reduce((s, d) => s + (currentWeekly[d] || 0), 0) / 7);
  const isCapacityOverridden = dailyMinutesOverride !== undefined || weeklyMinutesOverride !== undefined;
  const hasOverload = data.some(d => d.overloaded);
  const avgCapacity = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.capacityMin, 0) / data.length) : 0;

  const options = [...VIEW_OPTIONS, { value: 'target' as ForecastView, label: 'Escolher data' }];

  const plansWithDate = (plansList ?? []).filter(p => p.target_date);

  const handleEditNewCards = () => {
    setTempNewCards(String(newCardsOverride ?? defaultNewCardsPerDay));
    setEditingNewCards(true);
  };

  const handleConfirmNewCards = () => {
    const val = parseInt(tempNewCards, 10);
    if (!isNaN(val) && val >= 0) {
      onNewCardsChange(val === defaultNewCardsPerDay ? undefined : val);
    }
    setEditingNewCards(false);
  };

  const handleResetNewCards = () => {
    onNewCardsChange(undefined);
    setEditingNewCards(false);
  };

  const handleEditCreatedCards = () => {
    setTempCreatedCards(String(createdCardsOverride ?? defaultCreatedCardsPerDay));
    setEditingCreatedCards(true);
  };

  const handleConfirmCreatedCards = () => {
    const val = parseInt(tempCreatedCards, 10);
    if (!isNaN(val) && val >= 0) {
      onCreatedCardsChange(val === defaultCreatedCardsPerDay ? undefined : val);
    }
    setEditingCreatedCards(false);
  };

  const handleResetCreatedCards = () => {
    onCreatedCardsChange(undefined);
    setEditingCreatedCards(false);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header with filters */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Simulação de Estudos</h3>
          </div>
          
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

        {/* New cards per day */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">~</span>
          {editingNewCards ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={999}
                value={tempNewCards}
                onChange={e => setTempNewCards(e.target.value)}
                className="h-6 w-16 text-xs px-1.5"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleConfirmNewCards()}
              />
              <span className="text-muted-foreground">cards novos/dia</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleConfirmNewCards}>
                <Check className="h-3 w-3" />
              </Button>
              {newCardsOverride != null && (
                <button onClick={handleResetNewCards} className="text-[10px] text-primary underline">reset</button>
              )}
            </div>
          ) : (
            <button onClick={handleEditNewCards} className="flex items-center gap-1 hover:text-primary transition-colors">
              <span className="font-medium text-foreground">{newCardsOverride ?? defaultNewCardsPerDay}</span>
              <span className="text-muted-foreground">cards novos para estudar/dia</span>
              <Pencil className="h-3 w-3 text-muted-foreground/50" />
            </button>
          )}
        </div>

        {/* Created cards per day */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">+</span>
          {editingCreatedCards ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={9999}
                value={tempCreatedCards}
                onChange={e => setTempCreatedCards(e.target.value)}
                className="h-6 w-16 text-xs px-1.5"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleConfirmCreatedCards()}
              />
              <span className="text-muted-foreground">cards criados/dia</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleConfirmCreatedCards}>
                <Check className="h-3 w-3" />
              </Button>
              {createdCardsOverride != null && (
                <button onClick={handleResetCreatedCards} className="text-[10px] text-primary underline">reset</button>
              )}
            </div>
          ) : (
            <button onClick={handleEditCreatedCards} className="flex items-center gap-1 hover:text-primary transition-colors">
              <span className="font-medium text-foreground">{createdCardsOverride ?? defaultCreatedCardsPerDay}</span>
              <span className="text-muted-foreground">cards criados/dia</span>
              <Pencil className="h-3 w-3 text-muted-foreground/50" />
            </button>
          )}
        </div>

        {/* Study time / capacity */}
        <div className="flex items-center gap-2 text-xs">
          <Timer className="h-3 w-3 text-muted-foreground" />
          <button onClick={() => {
            setTempWeekly(currentWeekly);
            setEditingCapacity(true);
          }} className="flex items-center gap-1 hover:text-primary transition-colors">
            <span className="font-medium text-foreground">Tempo de estudo diário</span>
            <span className="text-muted-foreground">(média {currentAvgMin}min)</span>
            <Pencil className="h-3 w-3 text-muted-foreground/50" />
            {isCapacityOverridden && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1 border-primary/40 text-primary">simulando</Badge>
            )}
          </button>
        </div>

        {/* Capacity edit modal - always weekly */}
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
                    <span className={cn("text-xs font-semibold w-10 text-right", tempWeekly[dk] === 0 && "text-muted-foreground")}>{tempWeekly[dk] === 0 ? 'Folga' : formatMinutes(tempWeekly[dk])}</span>
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

        {isUsingDefaults && (
          <div className="flex items-center gap-2 text-[10px] text-primary px-2 py-1">
            <div className="shrink-0 p-1 -m-1">
              <Info className="h-3.5 w-3.5" />
            </div>
            <span>As previsões são baseadas em estimativas iniciais. Conforme você estuda, o algoritmo aprende seu desempenho real e ajusta automaticamente.</span>
          </div>
        )}

        {/* Progress bar during simulation */}
        {isSimulating && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1" />
            <p className="text-[10px] text-muted-foreground text-center">Simulando... {progress}%</p>
          </div>
        )}

        {/* Chart */}
        {data.length > 0 && !isSimulating && (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={data} barGap={0} barCategoryGap="15%">
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  tickFormatter={(v) => `${v}min`}
                  domain={[0, (max: number) => Math.ceil(max * 1.15)]}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 10,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as ForecastPoint;
                    if (!d) return null;
                    return (
                      <div className="rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-md text-[11px] space-y-1">
                        <p className="font-semibold flex items-center gap-1.5">
                          <CalendarIcon className="h-3 w-3 text-primary" /> {d.day} — {d.date}
                        </p>
                        <div className="space-y-0.5">
                          <p className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: 'hsl(217 91% 60%)' }} />
                            {d.newCards} novos — {d.newMin}min
                          </p>
                          <p className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: 'hsl(38 92% 50%)' }} />
                            {d.learningCards} aprendendo — {d.learningMin}min
                          </p>
                          <p className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: 'hsl(280 67% 55%)' }} />
                            {d.relearningCards} reaprendendo — {d.relearningMin}min
                          </p>
                          <p className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: 'hsl(152 69% 47%)' }} />
                            {d.reviewCards} dominados — {d.reviewMin}min
                          </p>
                        </div>
                        <div className="pt-1 border-t space-y-0.5">
                          <p className="flex items-center gap-1.5 font-medium">
                            <Layers className="h-3 w-3 text-primary" />
                            {d.newCards + d.learningCards + d.relearningCards + d.reviewCards} cartões
                          </p>
                          <p className={cn('font-medium', d.overloaded && 'text-destructive')}>
                            ⏱ {d.totalMin}min / {d.capacityMin}min
                            {d.overloaded && ' ⚠️'}
                          </p>
                        </div>
                      </div>
                    );
                  }}
                />
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
                {/* Stacked bars */}
                <Bar dataKey="reviewMin" stackId="a" name="Dominados" fill="hsl(152 69% 47%)" opacity={0.85} radius={[0, 0, 0, 0]} />
                <Bar dataKey="relearningMin" stackId="a" name="Reaprendendo" fill="hsl(280 67% 55%)" opacity={0.85} radius={[0, 0, 0, 0]} />
                <Bar dataKey="learningMin" stackId="a" name="Aprendendo" fill="hsl(38 92% 50%)" opacity={0.85} radius={[0, 0, 0, 0]} />
                <Bar
                  dataKey="newMin"
                  stackId="a"
                  name="Novos"
                  fill="hsl(217 91% 60%)"
                  opacity={0.85}
                  radius={[3, 3, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Summary explanation - didactic */}
            {summary && (() => {
              const currentNewCards = newCardsOverride ?? defaultNewCardsPerDay;
              const isBelowCapacity = summary.avgDailyMin < avgCapacity;
              const peakDay = data.reduce((max, d) => d.totalMin > max.totalMin ? d : max, data[0]);

              // Phase analysis: intensive (new cards being introduced) vs maintenance (reviews only)
              const daysWithNew = data.filter(d => d.newCards > 0);
              const daysOnlyReview = data.filter(d => d.newCards === 0);
              const intenseDays = daysWithNew.length;
              const intenseAvgMin = intenseDays > 0
                ? Math.round(daysWithNew.reduce((s, d) => s + d.totalMin, 0) / intenseDays)
                : 0;
              const maintenanceAvgMin = daysOnlyReview.length > 0
                ? Math.round(daysOnlyReview.reduce((s, d) => s + d.totalMin, 0) / daysOnlyReview.length)
                : 0;
              const hasMaintenancePhase = daysOnlyReview.length >= 3 && intenseDays > 0;

              // Target date info
              const plansTarget = (plansList ?? []).filter(p => p.target_date);
              const earliestTarget = plansTarget.length > 0
                ? plansTarget.reduce((min, p) => { const d = new Date(p.target_date!); return d < min ? d : min; }, new Date(plansTarget[0].target_date!))
                : null;
              // Total unique new cards = sum of first day's newCards * days (approximation)
              // Actually, we need the total remaining new cards, not sum of daily studied
              // The correct count is: newCardsPerDay * daysWithNew (capped by what's available)
              // But the most accurate is just currentNewCards * intenseDays (the simulation already caps it)
              const createdInPeriod = (createdCardsOverride ?? defaultCreatedCardsPerDay) * data.length;
              const totalNewRemaining = totalNewCards + createdInPeriod;

              return (
                <div className="rounded-lg bg-muted/50 border px-3 py-2.5 space-y-2">
                  {/* Phase-aware explanation */}
                  {hasMaintenancePhase ? (
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-semibold text-foreground">Fase intensa</span>
                        <span className="text-[10px] text-muted-foreground">{intenseDays} dias · ~{formatMinutes(intenseAvgMin)}/dia</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Enquanto há cards novos (nunca vistos) sendo estudados, a carga diária será maior.
                      </p>
                      <div className="h-px bg-border" />
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-semibold text-foreground">Fase de manutenção</span>
                        <span className="text-[10px] text-muted-foreground">{daysOnlyReview.length} dias · ~{formatMinutes(maintenanceAvgMin)}/dia</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Após concluir os novos cards, sobram apenas revisões.
                      </p>
                      {summary.peakMin > intenseAvgMin * 1.2 && (
                        <>
                          <div className="h-px bg-border" />
                          <p className="text-[10px] text-muted-foreground">
                            📈 Pico em <strong className="text-foreground">{peakDay.day} ({peakDay.date})</strong> — <strong className="text-foreground">{formatMinutes(summary.peakMin)}</strong>
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Nos próximos <strong className="text-foreground">{data.length} dias</strong>, 
                      você estudará em média <strong className="text-foreground">{formatMinutes(summary.avgDailyMin)}/dia</strong>.
                      {summary.peakMin > summary.avgDailyMin * 1.2 && (
                        <> Pico em <strong className="text-foreground">{peakDay.day} ({peakDay.date})</strong> com <strong className="text-foreground">{formatMinutes(summary.peakMin)}</strong>.</>
                      )}
                    </p>
                  )}

                  {/* Target date context */}
                  {earliestTarget && totalNewRemaining > 0 && (
                    <>
                      <div className="h-px bg-border" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        🎯 <strong className="text-foreground">{totalNewRemaining} cards novos</strong> até <strong className="text-foreground">{format(earliestTarget, "dd/MM/yyyy")}</strong> — mantenha ao menos <strong className="text-foreground">{currentNewCards}/dia</strong>.
                      </p>
                    </>
                  )}

                  {/* Status: ok or overloaded */}
                  {isBelowCapacity && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
                      ✓ Seu ritmo cabe dentro da sua meta de <strong>{formatMinutes(avgCapacity)}/dia</strong>.
                    </p>
                  )}
                  {!isBelowCapacity && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                        {hasMaintenancePhase
                          ? <>Nos primeiros <strong>{intenseDays} dias</strong> a carga será alta porque você está introduzindo <strong>{currentNewCards} novos cards/dia</strong>. Depois disso, a carga se estabiliza em ~<strong>{formatMinutes(maintenanceAvgMin)}</strong>.</>
                          : <>Sua média de <strong>{formatMinutes(summary.avgDailyMin)}</strong> excede sua meta de <strong>{formatMinutes(avgCapacity)}</strong>.</>
                        }
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 gap-1"
                          onClick={() => {
                            const reduced = Math.max(1, Math.floor(currentNewCards * (avgCapacity / summary.avgDailyMin)));
                            onNewCardsChange(reduced === defaultNewCardsPerDay ? undefined : reduced);
                          }}
                        >
                          <Layers className="h-3 w-3" />
                          Reduzir novos cards/dia
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 gap-1"
                          onClick={() => {
                            setTempWeekly(currentWeekly);
                            setEditingCapacity(true);
                          }}
                        >
                          <Timer className="h-3 w-3" />
                          Aumentar tempo de estudo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Overload day dialog */}
            <Dialog open={!!overloadDialogDay} onOpenChange={() => setOverloadDialogDay(null)}>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Dia sobrecarregado
                  </DialogTitle>
                  <DialogDescription asChild>
                    <div className="space-y-2 pt-1">
                      {overloadDialogDay && (
                        <>
                          <p className="text-sm">
                            Em <span className="font-semibold">{overloadDialogDay.day} ({overloadDialogDay.date})</span>, a carga estimada é de{' '}
                            <span className="font-semibold text-amber-600 dark:text-amber-400">{formatMinutes(overloadDialogDay.totalMin)}</span>, 
                            mas sua capacidade é de <span className="font-semibold">{formatMinutes(overloadDialogDay.capacityMin)}</span>.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Nesse dia você precisará estudar mais do que o planejado. Considere reduzir novos cards/dia ou aumentar seu tempo de estudo.
                          </p>
                        </>
                      )}
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>

            {/* Date picker dialog for "Escolher data" */}
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
          </>
        )}

        {/* Apply button */}
        {hasAnyOverride && !isSimulating && data.length > 0 && (
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onApplyCapacity}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar ao meu plano
          </Button>
        )}

        {/* Empty state */}
        {data.length === 0 && !isSimulating && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nenhum dado para simular. Adicione baralhos aos seus objetivos.
          </div>
        )}
      </CardContent>
    </Card>
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
