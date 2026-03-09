import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCardStatistics } from '@/hooks/useCardStatistics';
import { useForecastSimulator } from '@/hooks/useForecastSimulator';
import { useDecks } from '@/hooks/useDecks';
import { useProfile } from '@/hooks/useProfile';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid,
} from 'recharts';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// ─── Helpers ──────────────────────────────────────────

function bucketize(values: number[], ranges: { label: string; min: number; max: number }[]) {
  return ranges.map(r => ({
    label: r.label,
    count: values.filter(v => v >= r.min && v < r.max).length,
  }));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Section header with optional info tooltip ────────

function SectionTitle({ title, info }: { title: string; info?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {info && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">
            {info}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────

const StatsPage = () => {
  const { user } = useAuth();
  const { data: stats, isLoading } = useCardStatistics();
  const { decks } = useDecks();
  const profile = useProfile();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Activity data
  const { data: activityData } = useQuery({
    queryKey: ['activity-full', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const tzOffsetMinutes = -new Date().getTimezoneOffset();
      const { data } = await supabase.rpc('get_activity_daily_breakdown', {
        p_user_id: user.id,
        p_tz_offset_minutes: tzOffsetMinutes,
        p_days: 365,
      } as any);
      return data as any;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const dayMap: Record<string, any> = activityData?.dayMap ?? {};

  // Forecast
  const allDeckIds = useMemo(() => (decks ?? []).filter(d => !d.is_archived).map(d => d.id), [decks]);
  const dailyMinutes = profile.data?.daily_study_minutes ?? 30;

  const forecast = useForecastSimulator({
    deckIds: allDeckIds,
    horizonDays: 30,
    dailyMinutes,
    weeklyMinutes: null,
    enabled: allDeckIds.length > 0,
  });

  // ─── Calendar ───────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  // ─── Distributions ──────────────────────────
  const intervalBuckets = useMemo(() => {
    if (!stats) return [];
    return bucketize(stats.intervalDistribution, [
      { label: '0', min: 0, max: 1 },
      { label: '1', min: 1, max: 2 },
      { label: '2-3', min: 2, max: 4 },
      { label: '4-7', min: 4, max: 8 },
      { label: '8-14', min: 8, max: 15 },
      { label: '15-30', min: 15, max: 31 },
      { label: '1-2m', min: 31, max: 61 },
      { label: '2-4m', min: 61, max: 121 },
      { label: '4-6m', min: 121, max: 181 },
      { label: '6-12m', min: 181, max: 366 },
      { label: '1a+', min: 366, max: 999999 },
    ]);
  }, [stats]);

  const stabilityBuckets = useMemo(() => {
    if (!stats) return [];
    return bucketize(stats.stabilityDistribution, [
      { label: '0-7d', min: 0, max: 7 },
      { label: '7-30d', min: 7, max: 30 },
      { label: '30-90d', min: 30, max: 90 },
      { label: '90d-1a', min: 90, max: 365 },
      { label: '1a+', min: 365, max: 999999 },
    ]);
  }, [stats]);

  const difficultyBuckets = useMemo(() => {
    if (!stats) return [];
    const buckets: { label: string; count: number }[] = [];
    for (let i = 1; i <= 10; i++) {
      buckets.push({
        label: String(i),
        count: stats.difficultyDistribution.filter(v => Math.round(v) === i).length,
      });
    }
    return buckets;
  }, [stats]);

  const retrievabilityBuckets = useMemo(() => {
    if (!stats) return [];
    return bucketize(stats.retrievabilityDistribution, [
      { label: '0-30%', min: 0, max: 30 },
      { label: '30-50%', min: 30, max: 50 },
      { label: '50-70%', min: 50, max: 70 },
      { label: '70-85%', min: 70, max: 85 },
      { label: '85-95%', min: 85, max: 95 },
      { label: '95%+', min: 95, max: 101 },
    ]);
  }, [stats]);

  const intervalPercentiles = useMemo(() => {
    if (!stats || stats.intervalDistribution.length === 0) return { p50: 0, p95: 0, max: 0 };
    const sorted = [...stats.intervalDistribution].sort((a, b) => a - b);
    return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: sorted[sorted.length - 1] };
  }, [stats]);

  const forecastData = useMemo(() => {
    if (!forecast.data || forecast.data.length === 0) return [];
    return forecast.data.slice(0, 30).map((pt: any) => ({
      day: `D${pt.day}`,
      review: pt.review ?? 0,
      new: pt.new ?? 0,
      learning: pt.learning ?? 0,
    }));
  }, [forecast.data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4 pb-24">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3">
          <h1 className="text-lg font-bold font-display">Desempenho</h1>
        </div>
        <div className="p-4 text-center text-muted-foreground mt-10">
          <p className="text-sm">Nenhum dado disponível ainda.</p>
          <p className="text-xs mt-1">Comece a estudar para ver suas estatísticas!</p>
        </div>
      </div>
    );
  }

  const cc = stats.cardCounts;

  const cardCategories = [
    { label: 'Novos', count: cc.new, color: 'hsl(var(--chart-1))' },
    { label: 'Aprendendo', count: cc.learning, color: 'hsl(var(--chart-2))' },
    { label: 'Reaprendendo', count: cc.relearning, color: 'hsl(var(--chart-3))' },
    { label: 'Recentes', count: cc.young, color: 'hsl(var(--chart-4))' },
    { label: 'Maduros', count: cc.mature, color: 'hsl(var(--chart-5))' },
    { label: 'Congelados', count: cc.frozen, color: 'hsl(var(--muted-foreground))' },
  ];

  const bc = stats.buttonCounts;
  const buttonData = [
    { label: 'Errei', count: bc.again, color: 'hsl(var(--destructive))' },
    { label: 'Difícil', count: bc.hard, color: 'hsl(var(--chart-3))' },
    { label: 'Bom', count: bc.good, color: 'hsl(var(--chart-2))' },
    { label: 'Fácil', count: bc.easy, color: 'hsl(var(--chart-1))' },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3">
        <h1 className="text-lg font-bold font-display">Desempenho</h1>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* ─── Calendar ─────────────────────────── */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-[10px] text-muted-foreground font-medium">{d}</span>
            ))}
            {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {monthDays.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const dd = dayMap[key];
              const cards = dd?.cards ?? 0;
              const intensity = cards === 0 ? 0 : cards < 20 ? 1 : cards < 50 ? 2 : cards < 100 ? 3 : 4;
              return (
                <div
                  key={key}
                  className={cn(
                    'aspect-square rounded-sm flex items-center justify-center text-[10px] font-medium transition-colors',
                    intensity === 0 && 'bg-muted/50 text-muted-foreground',
                    intensity === 1 && 'bg-primary/20 text-primary',
                    intensity === 2 && 'bg-primary/40 text-primary-foreground',
                    intensity === 3 && 'bg-primary/70 text-primary-foreground',
                    intensity === 4 && 'bg-primary text-primary-foreground',
                  )}
                >
                  {format(day, 'd')}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ─── Month summary ──────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Dias estudados', value: `${stats.monthSummary.days_studied}/${stats.monthSummary.days_in_month}` },
            { label: 'Total revisões', value: stats.monthSummary.total_reviews.toLocaleString() },
            { label: 'Média/dia', value: String(stats.monthSummary.avg_reviews_per_day) },
          ].map(item => (
            <Card key={item.label} className="p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{item.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.label}</p>
            </Card>
          ))}
        </div>

        {/* ─── Retenção Verdadeira + Botões ────── */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-4 space-y-2">
            <SectionTitle title="Retenção" info="Porcentagem de acertos nos cartões de revisão dos últimos 30 dias." />
            <p className="text-3xl font-bold text-primary tabular-nums">{stats.trueRetention.rate}%</p>
            <Progress value={stats.trueRetention.rate} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {stats.trueRetention.correct} / {stats.trueRetention.total} acertos
            </p>
          </Card>

          <Card className="p-4 space-y-2">
            <SectionTitle title="Respostas" info="Quantas vezes você usou cada botão nos últimos 30 dias." />
            <div className="space-y-1.5">
              {buttonData.map(btn => {
                const pct = bc.total > 0 ? (btn.count / bc.total * 100) : 0;
                return (
                  <div key={btn.label} className="space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-medium">{btn.label}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: btn.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ─── Card counts ────────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="Contagem de Cartões" info="Distribuição dos seus cartões por estado de aprendizado." />
          <div className="h-3 rounded-full overflow-hidden flex bg-muted">
            {cardCategories.filter(c => c.count > 0).map(cat => (
              <div
                key={cat.label}
                className="h-full transition-all"
                style={{ width: `${(cat.count / cc.total) * 100}%`, background: cat.color }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            {cardCategories.map(cat => (
              <div key={cat.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                <span className="text-[10px] text-muted-foreground">{cat.label}</span>
                <span className="text-[10px] font-semibold tabular-nums ml-auto">{cat.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ─── Intervals ──────────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="Intervalos" info="Tempo entre revisões dos cartões em revisão. Quanto maior, mais espaçada está sua repetição." />
          <div className="flex gap-1.5 flex-wrap">
            <StatBadge label="p50" value={`${intervalPercentiles.p50}d`} />
            <StatBadge label="p95" value={`${intervalPercentiles.p95}d`} />
            <StatBadge label="Máx" value={`${intervalPercentiles.max}d`} />
          </div>
          <MiniBarChart data={intervalBuckets} color="hsl(var(--primary))" />
        </Card>

        {/* ─── Stability + Difficulty side by side */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-4 space-y-2">
            <SectionTitle title="Estabilidade" info="Tempo (em dias) que um cartão pode esperar mantendo ~90% de chance de recall." />
            <MiniBarChart data={stabilityBuckets} color="hsl(var(--chart-2))" height={100} />
          </Card>
          <Card className="p-4 space-y-2">
            <SectionTitle title="Dificuldade" info="Escala de 1 a 10 do FSRS. Cartões com dificuldade alta precisam de mais revisões." />
            <MiniBarChart data={difficultyBuckets} color="hsl(var(--chart-3))" height={100} />
          </Card>
        </div>

        {/* ─── Retrievability ─────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="Recuperabilidade" info="Probabilidade estimada de lembrar cada cartão agora, calculada pelo FSRS." />
          <MiniBarChart data={retrievabilityBuckets} color="hsl(var(--chart-4))" />
        </Card>

        {/* ─── Forecast ───────────────────────── */}
        {forecastData.length > 0 && (
          <Card className="p-4 space-y-3">
            <SectionTitle title="Carga Prevista (30 dias)" info="Estimativa de quantos cartões você terá para revisar por dia nas próximas semanas." />
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="review" name="Revisão" stackId="1" fill="hsl(var(--chart-4))" stroke="hsl(var(--chart-4))" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="new" name="Novos" stackId="1" fill="hsl(var(--chart-1))" stroke="hsl(var(--chart-1))" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="learning" name="Aprendendo" stackId="1" fill="hsl(var(--chart-2))" stroke="hsl(var(--chart-2))" fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

// ─── Tiny reusable components ──────────────────────────

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-muted px-2 py-0.5 rounded-full">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function MiniBarChart({ data, color, height = 130 }: { data: { label: string; count: number }[]; color: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9 }} width={28} tickLine={false} axisLine={false} />
          <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
          <Bar dataKey="count" name="Cartões" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StatsPage;
