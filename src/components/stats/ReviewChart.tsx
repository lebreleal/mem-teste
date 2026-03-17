/**
 * ReviewChart — Reviews per day, hours studied, hourly breakdown, avg time/card,
 *               added vs reviewed, button counts, card counts, distributions.
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn, formatMinutes } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  ComposedChart, Line, AreaChart, Area,
} from 'recharts';
import { SectionTitle, PeriodFilterIcon, StatBadge, MiniBarChart } from './StatsShared';
import type { usePeriodFilter } from '@/hooks/useStatsData';
import type { CardStatistics } from '@/hooks/useCardStatistics';

interface ReviewChartProps {
  reviewsPerDayFilter: ReturnType<typeof usePeriodFilter>;
  reviewsPerDayChartData: any[];
  hoursFilter: ReturnType<typeof usePeriodFilter>;
  hoursStats: { totalMinutes: number; avgMinutes: number; daysStudied: number };
  hoursChartData: any[];
  hourlyChartData: any[];
  avgTimePerCardData: any[];
  addedVsReviewedFilter: ReturnType<typeof usePeriodFilter>;
  addedVsReviewedData: any[];
  stats: CardStatistics;
  intervalBuckets: { label: string; count: number }[];
  stabilityBuckets: { label: string; count: number }[];
  difficultyBuckets: { label: string; count: number }[];
  retrievabilityBuckets: { label: string; count: number }[];
  intervalPercentiles: { p50: number; p95: number; max: number };
  estimatedKnowledge: { count: number; avgRetrievability: number };
}

const ReviewChart = ({
  reviewsPerDayFilter, reviewsPerDayChartData,
  hoursFilter, hoursStats, hoursChartData,
  hourlyChartData, avgTimePerCardData,
  addedVsReviewedFilter, addedVsReviewedData,
  stats, intervalBuckets, stabilityBuckets, difficultyBuckets, retrievabilityBuckets,
  intervalPercentiles, estimatedKnowledge,
}: ReviewChartProps) => {
  const cc = stats.cardCounts;
  const bc = stats.buttonCounts;

  const cardCategories = [
    { label: 'Novos', count: cc.new, color: 'hsl(var(--info))' },
    { label: 'Aprendendo', count: cc.learning, color: 'hsl(var(--warning))' },
    { label: 'Reaprendendo', count: cc.relearning, color: 'hsl(var(--destructive))' },
    { label: 'Recentes', count: cc.young, color: 'hsl(var(--success))' },
    { label: 'Maduros', count: cc.mature, color: 'hsl(var(--primary))' },
    { label: 'Congelados', count: cc.frozen, color: 'hsl(var(--muted-foreground))' },
  ].sort((a, b) => b.count - a.count);

  const buttonData = [
    { label: 'Errei', count: bc.again, color: 'hsl(var(--destructive))' },
    { label: 'Difícil', count: bc.hard, color: 'hsl(var(--warning))' },
    { label: 'Bom', count: bc.good, color: 'hsl(var(--success))' },
    { label: 'Fácil', count: bc.easy, color: 'hsl(var(--info))' },
  ].sort((a, b) => b.count - a.count);

  const maturationRate = cc.total > 0 ? Math.round((cc.mature / cc.total) * 100) : 0;
  const totalHours = Math.floor(hoursStats.totalMinutes / 60);
  const totalRemainingMins = hoursStats.totalMinutes % 60;

  return (
    <>
      {/* 4. Revisões por Dia */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle title="Revisões por Dia" info="Total de cards revisados por dia no período selecionado." />
          <PeriodFilterIcon filter={reviewsPerDayFilter} />
        </div>
        {reviewsPerDayChartData.length > 1 ? (
          <div style={{ height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reviewsPerDayChartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(val: number) => [`${val} cards`, 'Revisões']}
                />
                <Bar dataKey="cards" name="Cards" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Dados insuficientes para o gráfico.</p>
        )}
      </Card>

      {/* 5. Horas Estudadas */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle title="Horas Estudadas" info="Tempo total de estudo calculado a partir da duração real de cada revisão." />
          <PeriodFilterIcon filter={hoursFilter} />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tabular-nums text-primary">{totalHours}</span>
          <span className="text-sm text-muted-foreground font-medium">h</span>
          <span className="text-xl font-bold tabular-nums text-primary">{totalRemainingMins}</span>
          <span className="text-sm text-muted-foreground font-medium">min</span>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Média: <strong className="text-foreground">{formatMinutes(hoursStats.avgMinutes)}/dia</strong></span>
          <span>{hoursStats.daysStudied} dias ativos</span>
        </div>
        {hoursChartData.length > 1 && (
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hoursChartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(val: number) => [`${val} min`, 'Tempo']}
                />
                <Bar dataKey="minutes" name="Minutos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* 6. Horário de Estudo */}
      <Card className="p-4 space-y-3">
        <SectionTitle title="Horário de Estudo" info="Distribuição das suas revisões por hora do dia (últimos 30 dias). A linha mostra a taxa de acerto (%) por hora." />
        {hourlyChartData.some(h => h.total > 0) ? (
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlyChartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={2} />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} domain={[0, 100]} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(val: number, name: string) => [
                    name === 'Acerto' ? `${val}%` : `${val} revisões`,
                    name
                  ]}
                />
                <Bar yAxisId="left" dataKey="total" name="Revisões" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.7} />
                <Line yAxisId="right" dataKey="successRate" name="Acerto" type="monotone" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado de horário disponível.</p>
        )}
      </Card>

      {/* 7. Tempo Médio por Card */}
      <Card className="p-4 space-y-3">
        <SectionTitle
          title="Tempo Médio por Card"
          info={"Média de segundos gastos por revisão, agrupado por semana.\n\nUma tendência de queda indica que você está ficando mais fluente no conteúdo."}
        />
        {avgTimePerCardData.length > 1 ? (
          <div style={{ height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={avgTimePerCardData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="avgTimeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(val: number) => [`${val}s`, 'Média/card']}
                />
                <Area type="monotone" dataKey="avgSeconds" name="Segundos/card" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#avgTimeGrad)" dot={{ r: 3, fill: 'hsl(var(--chart-3))' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Dados insuficientes para o gráfico.</p>
        )}
      </Card>

      {/* 10. Respostas */}
      <Card className="p-4 space-y-3">
        <SectionTitle title="Respostas" info={"Mostra quantas vezes você apertou cada botão nos últimos 30 dias."} />
        <div className="space-y-3">
          {buttonData.map(btn => {
            const pct = bc.total > 0 ? (btn.count / bc.total * 100) : 0;
            const maxCount = Math.max(...buttonData.map(b => b.count), 1);
            const barWidth = (btn.count / maxCount) * 100;
            return (
              <div key={btn.label} className="flex items-center gap-3">
                <span className="text-xs font-medium w-12 shrink-0">{btn.label}</span>
                <div className="flex-1 h-5 rounded-md bg-muted/40 overflow-hidden relative">
                  <div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.max(barWidth, 2)}%`, background: btn.color, opacity: 0.75 }} />
                </div>
                <span className="text-xs tabular-nums font-bold w-10 text-right shrink-0">{btn.count.toLocaleString()}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground text-right">Total: {bc.total.toLocaleString()} revisões</p>
      </Card>

      {/* 11. Contagem de Cartões */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle title="Contagem de Cartões" info={"Seus cartões são divididos em categorias:\n\n• Novos — Cartões que você nunca estudou.\n• Aprendendo — Cartões que você está vendo pela primeira vez hoje.\n• Reaprendendo — Cartões que você errou e voltaram para estudo.\n• Recentes — Cartões já revisados, mas com intervalo curto (menos de 21 dias).\n• Maduros — Cartões que você conhece bem (intervalo de 21+ dias).\n• Congelados — Cartões pausados ou suspensos."} />
          <span className="text-sm font-bold tabular-nums text-foreground">{cc.total} total</span>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex bg-muted">
          {cardCategories.filter(c => c.count > 0).map(cat => (
            <div key={cat.label} className="h-full transition-all" style={{ width: `${(cat.count / cc.total) * 100}%`, background: cat.color }} title={`${cat.label}: ${cat.count}`} />
          ))}
        </div>
        <div className="space-y-2">
          {cardCategories.map(cat => {
            const pct = cc.total > 0 ? (cat.count / cc.total * 100) : 0;
            return (
              <div key={cat.label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: cat.color }} />
                <span className="text-xs w-24 shrink-0">{cat.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 1)}%`, background: cat.color }} />
                </div>
                <span className="text-xs font-bold tabular-nums w-10 text-right">{cat.count}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 12. Cards Novos: Criados vs Estudados */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle
            title="Novos: Criados vs Estudados"
            info={"Comparação diária entre quantos cards novos você criou e quantos cards novos estudou pela primeira vez.\n\nAjuda a equilibrar a entrada de conteúdo novo com o ritmo de estudo."}
          />
          <PeriodFilterIcon filter={addedVsReviewedFilter} />
        </div>
        {addedVsReviewedData.length > 1 ? (
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={addedVsReviewedData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} width={28} tickLine={false} axisLine={false} />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="added" name="Criados" fill="hsl(var(--warning))" radius={[3, 3, 0, 0]} opacity={0.85} />
                <Bar dataKey="studied" name="Estudados" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Dados insuficientes para o gráfico.</p>
        )}
      </Card>

      {/* 13. Conhecimento Total Estimado */}
      <Card className="p-4 space-y-2">
        <SectionTitle
          title="Conhecimento Total Estimado"
          info={"Estimativa de quantos cartões você provavelmente lembra agora.\n\nFórmula: recuperabilidade média × cartões revisados.\n\nExemplo: se você tem 1000 cartões revisados e a recuperabilidade média é 85%, seu conhecimento estimado é ~850 cartões."}
        />
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-primary">{estimatedKnowledge.count.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">de {(stats.cardCounts.total - stats.cardCounts.new).toLocaleString()} cartões revisados</span>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Recuperabilidade média: <strong className="text-foreground">{estimatedKnowledge.avgRetrievability}%</strong></span>
          <span>Taxa de maturação: <strong className="text-foreground">{maturationRate}%</strong></span>
        </div>
      </Card>

      {/* ═══ DISTRIBUIÇÕES SRS ═══ */}

      {/* 14. Intervalos */}
      <Card className="p-4 space-y-3">
        <SectionTitle title="Intervalos" info={"O intervalo é o tempo entre uma revisão e a próxima de cada cartão.\n\n• p50 — Metade dos seus cartões tem intervalo menor que esse valor.\n• p95 — 95% dos cartões tem intervalo menor que esse.\n• Máx — O maior intervalo entre todos seus cartões."} />
        <div className="flex gap-1.5 flex-wrap">
          <StatBadge label="p50" value={`${Math.round(intervalPercentiles.p50)}d`} />
          <StatBadge label="p95" value={`${Math.round(intervalPercentiles.p95)}d`} />
          <StatBadge label="Máx" value={`${Math.round(intervalPercentiles.max)}d`} />
        </div>
        <MiniBarChart data={intervalBuckets} color="hsl(var(--primary))" />
      </Card>

      {/* Estabilidade + Dificuldade */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-4 space-y-2">
          <SectionTitle title="Estabilidade" info={"A estabilidade representa por quantos dias um cartão consegue ficar sem revisão mantendo ~90% de chance de acerto."} />
          <MiniBarChart data={stabilityBuckets} color="hsl(var(--chart-2))" height={100} />
        </Card>
        <Card className="p-4 space-y-2">
          <SectionTitle title="Dificuldade" info={"A dificuldade vai de 1 (fácil) a 10 (difícil). Ajustada automaticamente pelo algoritmo."} />
          <MiniBarChart data={difficultyBuckets} color="hsl(var(--chart-3))" height={100} />
        </Card>
      </div>

      {/* Recuperabilidade */}
      <Card className="p-4 space-y-3">
        <SectionTitle title="Recuperabilidade" info={"Probabilidade estimada de você lembrar cada cartão agora.\n\n• 95%+ — Provavelmente lembra.\n• 70-85% — Hora de revisar.\n• Abaixo de 50% — Provavelmente esqueceu."} />
        <MiniBarChart data={retrievabilityBuckets} color="hsl(var(--chart-4))" />
      </Card>
    </>
  );
};

export default ReviewChart;
