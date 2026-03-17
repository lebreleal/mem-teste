/**
 * RetentionChart — Retention gauge + retention over time line chart.
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import { SectionTitle } from './StatsShared';
/** Card statistics shape used by stats components */
export interface CardStatistics {
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  averageDifficulty: number;
  averageStability: number;
  retentionRate: number;
  matureRetentionRate: number;
  youngRetentionRate: number;
  intervalDistribution: { label: string; count: number }[];
  difficultyDistribution: { label: string; count: number }[];
  stabilityDistribution: { label: string; count: number }[];
}

interface RetentionChartProps {
  stats: CardStatistics;
  retentionChartData: { label: string; rate: number; total: number }[];
}

const RetentionChart = ({ stats, retentionChartData }: RetentionChartProps) => {
  return (
    <>
      {/* 8. Retenção (gauges) */}
      <Card className="p-4 space-y-3">
        <SectionTitle title="Retenção" info={"Esse número mostra a % de vezes que você acertou um cartão ao revisá-lo nos últimos 30 dias.\n\nO ideal é ficar entre 80% e 95%.\n\n• Jovens — Cards com estabilidade < 21 dias\n• Maduros — Cards com estabilidade ≥ 21 dias"} />
        <div className="flex items-center gap-4">
          <p className="text-3xl font-bold text-primary tabular-nums">{stats.trueRetention.rate}%</p>
          <div className="flex-1 space-y-1">
            <Progress value={stats.trueRetention.rate} className="h-2.5" />
            <p className="text-[11px] text-muted-foreground">{stats.trueRetention.correct} acertos de {stats.trueRetention.total} revisões</p>
          </div>
        </div>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="grid grid-cols-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 px-3 py-1.5">
            <span>Tipo</span>
            <span className="text-center">Acerto</span>
            <span className="text-right">Revisões</span>
          </div>
          {[
            { label: 'Jovens (< 21d)', data: stats.youngRetention },
            { label: 'Maduros (≥ 21d)', data: stats.matureRetention },
          ].map(row => (
            <div key={row.label} className="grid grid-cols-3 px-3 py-2 border-t border-border/30 text-xs">
              <span className="font-medium">{row.label}</span>
              <span className={cn("text-center font-bold tabular-nums", row.data.rate >= 80 ? 'text-success' : row.data.rate >= 50 ? 'text-warning' : 'text-destructive')}>
                {row.data.rate}%
              </span>
              <span className="text-right text-muted-foreground tabular-nums">{row.data.correct}/{row.data.total}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 9. Retenção ao Longo do Tempo */}
      <Card className="p-4 space-y-3">
        <SectionTitle
          title="Retenção ao Longo do Tempo"
          info={"Taxa de acerto (%) por semana nos últimos meses.\n\nMostra a evolução da sua retenção — se está melhorando ou piorando ao longo do tempo.\n\nO ideal é manter acima de 80%."}
        />
        {retentionChartData.length > 1 ? (
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={retentionChartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="retentionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} domain={[0, 100]} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(val: number, name: string) => [
                    name === 'Revisões' ? `${val}` : `${val}%`,
                    name
                  ]}
                />
                <Area type="monotone" dataKey="rate" name="Retenção" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#retentionGrad)" dot={{ r: 3, fill: 'hsl(var(--success))' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Dados insuficientes — continue estudando para ver a evolução.</p>
        )}
      </Card>
    </>
  );
};

export default RetentionChart;
