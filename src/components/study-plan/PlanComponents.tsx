import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, GripVertical, Play,
} from 'lucide-react';
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ForecastDataPoint } from '@/hooks/useStudyPlan';
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

// ─── Forecast Chart ─────────────────────────────────────
export function ForecastChart({ data }: { data: ForecastDataPoint[] }) {
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
            ({formatMinutes(Math.max(...overloadedDays.map(d => d.totalMin)))}). Considere ajustar capacidade ou repriorizar objetivos.
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
