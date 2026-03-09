import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCardStatistics } from '@/hooks/useCardStatistics';
import { useForecastSimulator } from '@/hooks/useForecastSimulator';
import { useDecks } from '@/hooks/useDecks';
import { useProfile } from '@/hooks/useProfile';
import { useRanking, useTogglePublicProfile } from '@/hooks/useRanking';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatMinutes } from '@/lib/utils';
import { HelpCircle, Flame, Clock, Trophy, Eye, EyeOff, TrendingUp, Users } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid,
} from 'recharts';
import {
  format, eachDayOfInterval, getDay, subDays, startOfWeek,
} from 'date-fns';

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

function SectionTitle({ title, info, icon }: { title: string; info?: string; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        {info && (
          <button onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {info && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">{title}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{info}</p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────

const StatsPage = () => {
  const { user } = useAuth();
  const { data: stats, isLoading } = useCardStatistics();
  const { decks } = useDecks();
  const profile = useProfile();
  const { data: ranking, isLoading: rankingLoading } = useRanking();
  const togglePublic = useTogglePublicProfile();
  const isPublic = profile.data?.is_profile_public ?? false;
  const currentStreak = profile.data?.current_streak ?? 0;

  // Activity data from RPC - this has the accurate daily data
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

  // Today's stats from activity data
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayStats = (activityData?.dayMap ?? {})[todayKey];
  const todayCards = todayStats?.cards ?? 0;
  const todayMinutes = todayStats?.minutes ?? 0;
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

  // ─── Heatmap (last 6 months) ─────────────
  const heatmapData = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(subDays(today, 182), { weekStartsOn: 0 });
    const allDays = eachDayOfInterval({ start, end: today });

    const weeks: { date: Date; key: string; cards: number; dow: number }[][] = [];
    let currentWeek: typeof weeks[0] = [];

    allDays.forEach(day => {
      const dow = getDay(day);
      if (dow === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      const key = format(day, 'yyyy-MM-dd');
      currentWeek.push({ date: day, key, cards: dayMap[key]?.cards ?? 0, dow });
    });
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const months: { label: string; colStart: number }[] = [];
    let lastMonth = -1;
    const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    weeks.forEach((week, i) => {
      const m = week[0].date.getMonth();
      if (m !== lastMonth) {
        months.push({ label: SHORT_MONTHS[m], colStart: i });
        lastMonth = m;
      }
    });

    return { weeks, months };
  }, [dayMap]);

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

        {/* ─── Perfil Público + Métricas Rápidas ── */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle title="Perfil Público" info="Ao ativar, seu nome e estatísticas aparecem no ranking global. Outros usuários podem ver seu streak, cards revisados e tempo de estudo dos últimos 30 dias." />
            <div className="flex items-center gap-2">
              {isPublic ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              <Switch
                checked={isPublic}
                onCheckedChange={(checked) => togglePublic.mutate(checked)}
                disabled={togglePublic.isPending}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-lg font-bold tabular-nums">{(profile.data as any)?.current_streak ?? 0}</span>
              <span className="text-[10px] text-muted-foreground">Streak</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold tabular-nums">{studyStats?.todayCards ?? 0}</span>
              <span className="text-[10px] text-muted-foreground">Hoje</span>
            </div>
            <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50">
              <Clock className="h-4 w-4 text-chart-2" />
              <span className="text-lg font-bold tabular-nums">{formatMinutes(studyStats?.todayMinutes ?? 0)}</span>
              <span className="text-[10px] text-muted-foreground">Tempo hoje</span>
            </div>
          </div>
        </Card>

        {/* ─── Ranking Global ────────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="🏆 Ranking Global" info="Top 50 usuários com perfil público, ordenados por cards revisados nos últimos 30 dias." />
          {rankingLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !ranking || ranking.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum usuário público ainda. Ative seu perfil público para aparecer aqui!</p>
          ) : (
            <div className="space-y-1">
              {ranking.map((entry, i) => {
                const isMe = entry.user_id === user?.id;
                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isMe ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className={cn(
                      'w-6 text-center font-bold tabular-nums text-xs',
                      i === 0 && 'text-yellow-500',
                      i === 1 && 'text-muted-foreground',
                      i === 2 && 'text-orange-400',
                    )}>
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}º`}
                    </span>
                    <span className={cn('flex-1 truncate text-sm', isMe && 'font-semibold')}>
                      {entry.user_name || 'Usuário'}
                    </span>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
                      <span title="Cards revisados (30d)">{entry.cards_30d.toLocaleString()} cards</span>
                      <span title="Horas estudadas (30d)">{formatMinutes(entry.minutes_30d)}</span>
                      <span title="Streak atual" className="flex items-center gap-0.5">
                        <Flame className="h-3 w-3 text-orange-500" />
                        {entry.current_streak}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ─── Heatmap ──────────────────────────── */}
        <Card className="p-4 space-y-2">
          <SectionTitle title="Atividade" info="Mapa de calor dos últimos 6 meses. Cada quadrado representa um dia — quanto mais escuro, mais cards você revisou naquele dia." />
          <div className="overflow-x-auto -mx-1 px-1">
            {/* Month labels */}
            <div className="flex ml-5" style={{ gap: 0 }}>
              {heatmapData.months.map((m, i) => {
                const nextCol = heatmapData.months[i + 1]?.colStart ?? heatmapData.weeks.length;
                const span = nextCol - m.colStart;
                return (
                  <span
                    key={`${m.label}-${m.colStart}`}
                    className="text-[9px] text-muted-foreground"
                    style={{ width: span * 13, flexShrink: 0 }}
                  >
                    {m.label}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-0">
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-[2px] mr-1 justify-start">
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="text-[8px] text-muted-foreground leading-none" style={{ height: 11, display: 'flex', alignItems: 'center' }}>
                    {i % 2 === 1 ? d : ''}
                  </span>
                ))}
              </div>
              {/* Grid */}
              <div className="flex gap-[2px]">
                {heatmapData.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {Array.from({ length: 7 }).map((_, dow) => {
                      const cell = week.find(c => c.dow === dow);
                      if (!cell) return <div key={dow} className="w-[11px] h-[11px]" />;
                      const cards = cell.cards;
                      const intensity = cards === 0 ? 0 : cards < 20 ? 1 : cards < 50 ? 2 : cards < 100 ? 3 : 4;
                      return (
                        <div
                          key={dow}
                          title={`${format(cell.date, 'dd/MM')}: ${cards} cards`}
                          className={cn(
                            'w-[11px] h-[11px] rounded-[2px] transition-colors',
                            intensity === 0 && 'bg-muted/60',
                            intensity === 1 && 'bg-primary/20',
                            intensity === 2 && 'bg-primary/40',
                            intensity === 3 && 'bg-primary/70',
                            intensity === 4 && 'bg-primary',
                          )}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-1 mt-2 justify-end">
              <span className="text-[9px] text-muted-foreground mr-1">Menos</span>
              {[0, 1, 2, 3, 4].map(level => (
                <div
                  key={level}
                  className={cn(
                    'w-[11px] h-[11px] rounded-[2px]',
                    level === 0 && 'bg-muted/60',
                    level === 1 && 'bg-primary/20',
                    level === 2 && 'bg-primary/40',
                    level === 3 && 'bg-primary/70',
                    level === 4 && 'bg-primary',
                  )}
                />
              ))}
              <span className="text-[9px] text-muted-foreground ml-1">Mais</span>
            </div>
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
            <SectionTitle title="Retenção" info={"Esse número mostra a % de vezes que você acertou um cartão ao revisá-lo nos últimos 30 dias.\n\nPor exemplo, se você revisou 100 cartões e acertou 85, sua retenção é 85%.\n\nO ideal é ficar entre 80% e 95%. Abaixo de 80% significa que os intervalos estão muito longos. Acima de 95% pode significar que você está revisando demais."} />
            <p className="text-3xl font-bold text-primary tabular-nums">{stats.trueRetention.rate}%</p>
            <Progress value={stats.trueRetention.rate} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {stats.trueRetention.correct} / {stats.trueRetention.total} acertos
            </p>
          </Card>

          <Card className="p-4 space-y-2">
            <SectionTitle title="Respostas" info={"Mostra quantas vezes você apertou cada botão nos últimos 30 dias:\n\n• Errei — Você não lembrou do cartão. Ele volta pra fila de aprendizado.\n• Difícil — Lembrou com dificuldade. O intervalo aumenta pouco.\n• Bom — Lembrou normalmente. O intervalo aumenta de forma padrão.\n• Fácil — Lembrou instantaneamente. O intervalo aumenta bastante.\n\nUm equilíbrio saudável tem poucos 'Errei' e a maioria em 'Bom'."} />
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
          <SectionTitle title="Contagem de Cartões" info={"Seus cartões são divididos em categorias:\n\n• Novos — Cartões que você nunca estudou.\n• Aprendendo — Cartões que você está vendo pela primeira vez hoje.\n• Reaprendendo — Cartões que você errou e voltaram para estudo.\n• Recentes — Cartões já revisados, mas com intervalo curto (menos de 21 dias).\n• Maduros — Cartões que você conhece bem (intervalo de 21+ dias).\n• Congelados — Cartões pausados ou suspensos.\n\nO objetivo é ter cada vez mais cartões maduros!"} />
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
          <SectionTitle title="Intervalos" info={"O intervalo é o tempo entre uma revisão e a próxima de cada cartão.\n\nQuando você acerta um cartão, o app agenda a próxima revisão mais para frente. Se você acerta de novo, ele agenda ainda mais longe — e assim por diante.\n\nEste gráfico mostra como seus intervalos estão distribuídos. Quanto mais barras à direita (intervalos longos), mais cartões você já domina.\n\n• p50 — Metade dos seus cartões tem intervalo menor que esse valor.\n• p95 — 95% dos cartões tem intervalo menor que esse.\n• Máx — O maior intervalo entre todos seus cartões."} />
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
            <SectionTitle title="Estabilidade" info={"A estabilidade representa por quantos dias um cartão consegue ficar sem revisão mantendo cerca de 90% de chance de você lembrar.\n\nPor exemplo, estabilidade de 30 dias significa que, se você esperar 30 dias para revisar, ainda tem ~90% de chance de acertar.\n\nQuanto maior a estabilidade, melhor — significa que a memória está mais consolidada."} />
            <MiniBarChart data={stabilityBuckets} color="hsl(var(--chart-2))" height={100} />
          </Card>
          <Card className="p-4 space-y-2">
            <SectionTitle title="Dificuldade" info={"A dificuldade vai de 1 (muito fácil) a 10 (muito difícil).\n\nO algoritmo ajusta automaticamente esse valor conforme você estuda. Cartões que você erra frequentemente ficam com dificuldade alta. Cartões que você sempre acerta ficam com dificuldade baixa.\n\nSe muitos cartões estão com dificuldade alta (7-10), pode ser útil reformular o conteúdo desses cartões para facilitar a memorização."} />
            <MiniBarChart data={difficultyBuckets} color="hsl(var(--chart-3))" height={100} />
          </Card>
        </div>

        {/* ─── Retrievability ─────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="Recuperabilidade" info={"A recuperabilidade mostra a probabilidade estimada de você lembrar cada cartão AGORA, neste momento.\n\nQuando você acabou de revisar um cartão, a recuperabilidade é ~100%. Com o passar dos dias sem revisar, ela vai caindo.\n\n• 95%+ — Você provavelmente lembra.\n• 70-85% — Está na hora de revisar.\n• Abaixo de 50% — Provavelmente já esqueceu.\n\nO app agenda as revisões para que a recuperabilidade não caia muito antes de você rever."} />
          <MiniBarChart data={retrievabilityBuckets} color="hsl(var(--chart-4))" />
        </Card>

        {/* ─── Forecast ───────────────────────── */}
        {forecastData.length > 0 && (
          <Card className="p-4 space-y-3">
            <SectionTitle title="Carga Prevista (30 dias)" info={"Este gráfico mostra uma estimativa de quantos cartões você terá para estudar por dia nas próximas semanas.\n\n• Revisão (maior parte) — Cartões que vão vencer e precisam ser revisados.\n• Novos — Cartões novos que o app vai introduzir por dia.\n• Aprendendo — Cartões que ainda estão no processo inicial de aprendizado.\n\nSe a carga estiver muito alta, considere reduzir o número de cartões novos por dia nas configurações do deck."} />
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
