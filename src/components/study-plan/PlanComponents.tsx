import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, GripVertical, Play, Pencil, Check, Info, Clock, Zap, TrendingUp } from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ForecastPoint, ForecastView, SimulatorSummary } from '@/types/forecast';
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

// ─── Forecast Simulator ─────────────────────────────────

const VIEW_OPTIONS: { value: ForecastView; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '365d', label: '1 ano' },
];

export function ForecastSimulator({
  data, summary, isSimulating, progress, defaultNewCardsPerDay,
  forecastView, onViewChange, newCardsOverride, onNewCardsChange,
  hasTargetDate, isUsingDefaults,
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
  isUsingDefaults: boolean;
}) {
  const [editingNewCards, setEditingNewCards] = useState(false);
  const [tempNewCards, setTempNewCards] = useState(String(newCardsOverride ?? defaultNewCardsPerDay));
  const hasOverload = data.some(d => d.overloaded);
  const maxCapacity = data.length > 0 ? Math.max(...data.map(d => d.capacityMin)) : 0;

  const options = hasTargetDate
    ? [...VIEW_OPTIONS, { value: 'target' as ForecastView, label: 'Até a prova' }]
    : VIEW_OPTIONS;

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

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header with filters */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Previsão de Carga</h3>
          {hasOverload && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
        </div>

        {/* View chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border',
                forecastView === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
              )}
            >
              {opt.label}
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
              <span className="text-muted-foreground">novos/dia</span>
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
              <span className="text-muted-foreground">novos para estudar/dia</span>
              <Pencil className="h-3 w-3 text-muted-foreground/50" />
            </button>
          )}
        </div>

        {/* Defaults indicator */}
        {isUsingDefaults && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
            <Info className="h-3 w-3" />
            Usando estimativas padrão (estude mais para previsões personalizadas)
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
                  tickFormatter={(v) => `${v}m`}
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
                        <p className="font-semibold">📅 {d.day} — {d.date}</p>
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
                            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: 'hsl(152 69% 47%)' }} />
                            {d.reviewCards} revisões — {d.reviewMin}min
                          </p>
                        </div>
                        <p className={cn('pt-1 border-t font-medium', d.overloaded && 'text-red-500')}>
                          Total: {d.totalMin}min / {d.capacityMin}min
                          {d.overloaded && ' ⚠️'}
                        </p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={maxCapacity}
                  stroke="hsl(var(--muted-foreground) / 0.4)"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: `${maxCapacity}m`,
                    position: 'right',
                    fontSize: 9,
                    fill: 'hsl(var(--muted-foreground))',
                  }}
                />
                {/* Stacked bars: bottom=review (green), mid=learning (amber), top=new (blue) */}
                <Bar dataKey="reviewMin" stackId="a" name="Revisões" fill="hsl(152 69% 47%)" opacity={0.85} radius={[0, 0, 0, 0]} />
                <Bar dataKey="learningMin" stackId="a" name="Aprendendo" fill="hsl(38 92% 50%)" opacity={0.85} radius={[0, 0, 0, 0]} />
                <Bar dataKey="newMin" stackId="a" name="Novos" fill="hsl(217 91% 60%)" opacity={0.85} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground px-1">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: 'hsl(217 91% 60%)' }} />
                Novos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: 'hsl(38 92% 50%)' }} />
                Aprendendo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: 'hsl(152 69% 47%)' }} />
                Revisões
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 border-t-2 border-dashed inline-block" style={{ borderColor: 'hsl(var(--muted-foreground) / 0.4)' }} />
                Capacidade
              </span>
            </div>

            {/* Summary metrics */}
            {summary && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/40 rounded-lg px-2 py-2 space-y-0.5">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">Média/dia</p>
                  </div>
                  <p className="text-sm font-bold">{formatMinutes(summary.avgDailyMin)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg px-2 py-2 space-y-0.5">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">Pico</p>
                  </div>
                  <p className="text-sm font-bold">{formatMinutes(summary.peakMin)}</p>
                </div>
                <div className={cn(
                  'rounded-lg px-2 py-2 space-y-0.5',
                  summary.overloadedDays > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/40'
                )}>
                  <div className="flex items-center justify-center gap-1">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">Sobrecarga</p>
                  </div>
                  <p className={cn('text-sm font-bold', summary.overloadedDays > 0 && 'text-amber-600 dark:text-amber-400')}>
                    {summary.overloadedDays} dia{summary.overloadedDays !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Overload warning */}
            {summary && summary.overloadedDays > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-2 text-[11px]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Sobrecarga em {summary.overloadedDays} dia{summary.overloadedDays !== 1 ? 's' : ''}</p>
                  <p className="text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                    Pico de {formatMinutes(summary.peakMin)} em {summary.peakDate}. Reduza novos cards/dia ou aumente a capacidade.
                  </p>
                </div>
              </div>
            )}
          </>
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
