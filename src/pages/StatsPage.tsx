import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCardStatistics } from '@/hooks/useCardStatistics';
import { useDecks } from '@/hooks/useDecks';
import { useProfile } from '@/hooks/useProfile';
import { useRanking, useTogglePublicProfile } from '@/hooks/useRanking';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatMinutes } from '@/lib/utils';
import {
  HelpCircle, Flame, Clock, Trophy, Users, Settings2,
  ChevronRight, Zap, Calendar, Medal, CheckCircle2, Snowflake, CalendarIcon, Timer,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import {
  format, eachDayOfInterval, getDay, subDays, startOfWeek, subMonths, isAfter, isBefore, startOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

type PeriodKey = 'all' | '1m' | '3m' | '1y' | 'custom';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: '1m', label: '1 mês' },
  { key: '3m', label: '3 meses' },
  { key: '1y', label: '1 ano' },
  { key: 'custom', label: 'Período' },
];

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
            <DialogHeader><DialogTitle className="text-base">{title}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{info}</p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// Medal component for podium positions
function RankMedal({ position }: { position: number }) {
  if (position === 1) return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-md shadow-amber-400/30">
      <Trophy className="h-4 w-4 text-white drop-shadow" />
    </div>
  );
  if (position === 2) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-400 shadow-sm">
      <Medal className="h-3.5 w-3.5 text-white drop-shadow" />
    </div>
  );
  if (position === 3) return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-500 shadow-sm">
      <Medal className="h-3.5 w-3.5 text-white drop-shadow" />
    </div>
  );
  return (
    <div className="flex h-7 w-7 items-center justify-center">
      <span className="text-xs font-bold tabular-nums text-muted-foreground">{position}º</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────

const StatsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useCardStatistics();
  const { decks } = useDecks();
  const profile = useProfile();
  const { data: ranking, isLoading: rankingLoading } = useRanking();
  const togglePublic = useTogglePublicProfile();
  const isPublic = profile.data?.is_profile_public ?? true;

  const [rankingSort, setRankingSort] = useState<'cards' | 'hours' | 'streak'>('cards');
  const [rankingConfigOpen, setRankingConfigOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [pickingField, setPickingField] = useState<'from' | 'to'>('from');

  // Activity data from RPC
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

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const dayMap: Record<string, any> = activityData?.dayMap ?? {};
  const currentStreak = activityData?.streak ?? 0;

  // Period date range
  const periodRange = useMemo(() => {
    const today = startOfDay(new Date());
    switch (period) {
      case '1m': return { from: subMonths(today, 1), to: today };
      case '3m': return { from: subMonths(today, 3), to: today };
      case '1y': return { from: subMonths(today, 12), to: today };
      case 'custom':
        return { from: customFrom ? startOfDay(customFrom) : subMonths(today, 12), to: customTo ? startOfDay(customTo) : today };
      default: return { from: null, to: today }; // all time
    }
  }, [period, customFrom, customTo]);

  // Filter dayMap by period
  const filteredDayMap = useMemo(() => {
    if (!periodRange.from) return dayMap;
    const filtered: Record<string, any> = {};
    for (const [key, val] of Object.entries(dayMap)) {
      const d = new Date(key);
      if ((!periodRange.from || !isBefore(d, periodRange.from)) && (!periodRange.to || !isAfter(d, periodRange.to))) {
        filtered[key] = val;
      }
    }
    return filtered;
  }, [dayMap, periodRange]);

  // Computed stats from filtered data
  const filteredStats = useMemo(() => {
    const entries = Object.values(filteredDayMap);
    const totalCards = entries.reduce((s: number, d: any) => s + (Number(d.cards) || 0), 0);
    const totalMinutes = entries.reduce((s: number, d: any) => s + (Number(d.minutes) || 0), 0);
    const totalNew = entries.reduce((s: number, d: any) => s + (Number(d.newCards) || 0), 0);
    const totalLearning = entries.reduce((s: number, d: any) => s + (Number(d.learning) || 0), 0);
    const totalReview = entries.reduce((s: number, d: any) => s + (Number(d.review) || 0), 0);
    const daysStudied = entries.filter((d: any) => (Number(d.cards) || 0) > 0).length;
    const totalDays = periodRange.from ? Math.max(1, Math.ceil((periodRange.to!.getTime() - periodRange.from.getTime()) / 86400000) + 1) : Math.max(1, Object.keys(dayMap).length);
    const avgCards = daysStudied > 0 ? Math.round(totalCards / daysStudied) : 0;
    const avgMinutes = daysStudied > 0 ? Math.round(totalMinutes / daysStudied) : 0;
    return { totalCards, totalMinutes, totalNew, totalLearning, totalReview, daysStudied, totalDays, avgCards, avgMinutes };
  }, [filteredDayMap, periodRange, dayMap]);

  // Hours chart data (daily minutes bar chart)
  const hoursChartData = useMemo(() => {
    const entries = Object.entries(filteredDayMap)
      .map(([key, val]: [string, any]) => ({ date: key, minutes: Number(val.minutes) || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // If too many entries, group by week
    if (entries.length > 60) {
      const weeks: Record<string, number> = {};
      entries.forEach(e => {
        const weekStart = format(startOfWeek(new Date(e.date), { weekStartsOn: 0 }), 'dd/MM');
        weeks[weekStart] = (weeks[weekStart] || 0) + e.minutes;
      });
      return Object.entries(weeks).map(([label, minutes]) => ({ label, minutes }));
    }
    return entries.map(e => ({ label: format(new Date(e.date), 'dd/MM'), minutes: e.minutes }));
  }, [filteredDayMap]);

  const todayStats = dayMap[todayKey];
  const todayCards = todayStats?.cards ?? 0;

  // Sorted ranking
  const sortedRanking = useMemo(() => {
    if (!ranking) return [];
    const copy = [...ranking];
    if (rankingSort === 'hours') copy.sort((a, b) => b.minutes_30d - a.minutes_30d);
    else if (rankingSort === 'streak') copy.sort((a, b) => b.current_streak - a.current_streak);
    else copy.sort((a, b) => b.cards_30d - a.cards_30d);
    return copy;
  }, [ranking, rankingSort]);

  // ─── Heatmap ─────────────
  const heatmapData = useMemo(() => {
    const today = new Date();
    const sixMonthsAgo = subDays(today, 182);
    const accountCreated = profile.data?.created_at ? new Date(profile.data.created_at) : sixMonthsAgo;
    const effectiveStart = accountCreated > sixMonthsAgo ? accountCreated : sixMonthsAgo;
    const start = startOfWeek(effectiveStart, { weekStartsOn: 0 });
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
  }, [dayMap, profile.data?.created_at]);

  // ─── Distributions ──────────────────────────
  const intervalBuckets = useMemo(() => {
    if (!stats) return [];
    return bucketize(stats.intervalDistribution, [
      { label: '0', min: 0, max: 1 }, { label: '1', min: 1, max: 2 },
      { label: '2-3', min: 2, max: 4 }, { label: '4-7', min: 4, max: 8 },
      { label: '8-14', min: 8, max: 15 }, { label: '15-30', min: 15, max: 31 },
      { label: '1-2m', min: 31, max: 61 }, { label: '2-4m', min: 61, max: 121 },
      { label: '4-6m', min: 121, max: 181 }, { label: '6-12m', min: 181, max: 366 },
      { label: '1a+', min: 366, max: 999999 },
    ]);
  }, [stats]);

  const stabilityBuckets = useMemo(() => {
    if (!stats) return [];
    return bucketize(stats.stabilityDistribution, [
      { label: '0-7d', min: 0, max: 7 }, { label: '7-30d', min: 7, max: 30 },
      { label: '30-90d', min: 30, max: 90 }, { label: '90d-1a', min: 90, max: 365 },
      { label: '1a+', min: 365, max: 999999 },
    ]);
  }, [stats]);

  const difficultyBuckets = useMemo(() => {
    if (!stats) return [];
    const buckets: { label: string; count: number }[] = [];
    for (let i = 1; i <= 10; i++) {
      buckets.push({ label: String(i), count: stats.difficultyDistribution.filter(v => Math.round(v) === i).length });
    }
    return buckets;
  }, [stats]);

  const retrievabilityBuckets = useMemo(() => {
    if (!stats) return [];
    return bucketize(stats.retrievabilityDistribution, [
      { label: '0-30%', min: 0, max: 30 }, { label: '30-50%', min: 30, max: 50 },
      { label: '50-70%', min: 50, max: 70 }, { label: '70-85%', min: 70, max: 85 },
      { label: '85-95%', min: 85, max: 95 }, { label: '95%+', min: 95, max: 101 },
    ]);
  }, [stats]);

  const intervalPercentiles = useMemo(() => {
    if (!stats || stats.intervalDistribution.length === 0) return { p50: 0, p95: 0, max: 0 };
    const sorted = [...stats.intervalDistribution].sort((a, b) => a - b);
    return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: sorted[sorted.length - 1] };
  }, [stats]);

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
    { label: 'Novos', count: cc.new, color: 'hsl(var(--info))' },
    { label: 'Aprendendo', count: cc.learning, color: 'hsl(var(--warning))' },
    { label: 'Reaprendendo', count: cc.relearning, color: 'hsl(var(--destructive))' },
    { label: 'Recentes', count: cc.young, color: 'hsl(var(--success))' },
    { label: 'Maduros', count: cc.mature, color: 'hsl(var(--primary))' },
    { label: 'Congelados', count: cc.frozen, color: 'hsl(var(--muted-foreground))' },
  ];

  const bc = stats.buttonCounts;
  const buttonData = [
    { label: 'Errei', count: bc.again, color: 'hsl(var(--destructive))' },
    { label: 'Difícil', count: bc.hard, color: 'hsl(var(--warning))' },
    { label: 'Bom', count: bc.good, color: 'hsl(var(--success))' },
    { label: 'Fácil', count: bc.easy, color: 'hsl(var(--info))' },
  ];

  const myRank = sortedRanking?.findIndex(r => r.user_id === user?.id);
  const myRankEntry = myRank !== undefined && myRank >= 0 ? sortedRanking![myRank] : null;

  const getRankValue = (entry: typeof sortedRanking[0]) => {
    if (rankingSort === 'hours') return formatMinutes(entry.minutes_30d);
    if (rankingSort === 'streak') return `${entry.current_streak} dias`;
    return `${entry.cards_30d.toLocaleString()} cards`;
  };

  const rankingSortOptions = [
    { key: 'cards' as const, label: 'Cards', icon: Zap },
    { key: 'hours' as const, label: 'Horas', icon: Clock },
    { key: 'streak' as const, label: 'Streak', icon: Flame },
  ];

  const totalHours = Math.floor(filteredStats.totalMinutes / 60);
  const totalRemainingMins = filteredStats.totalMinutes % 60;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3">
        <h1 className="text-lg font-bold font-display">Desempenho</h1>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">

        {/* ─── Quick Stats ────────────────────── */}
        <Card className="px-3 py-2.5 flex items-center justify-between gap-2 overflow-hidden flex-wrap">
          <div className="flex items-center gap-1 shrink-0">
            <Flame className={cn("h-5 w-5", currentStreak > 0 ? "text-orange-500 fill-orange-500" : "text-muted-foreground/40")}
              style={currentStreak >= 3 ? { filter: 'drop-shadow(0 0 4px hsl(38 92% 50% / 0.5))' } : undefined} />
            <span className="text-base font-bold tabular-nums">{currentStreak}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{currentStreak === 1 ? 'dia\nseguido' : 'dias\nseguidos'}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold tabular-nums">{todayCards}</span>
            <HelpCircle className="h-3 w-3 text-muted-foreground/40" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm font-bold tabular-nums">{stats.monthSummary.total_reviews}</span>
            <HelpCircle className="h-3 w-3 text-muted-foreground/40" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Snowflake className="h-4 w-4 text-info" />
            <span className="text-sm font-bold tabular-nums">{cc.frozen}</span>
            <HelpCircle className="h-3 w-3 text-muted-foreground/40" />
          </div>
        </Card>

        {/* ─── Period Filter ────────────────────── */}
        <div className="flex gap-1.5 flex-wrap">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => {
                setPeriod(opt.key);
                if (opt.key === 'custom') setCustomPickerOpen(true);
              }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                period === opt.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom period display */}
        {period === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'De'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customFrom}
                  onSelect={setCustomFrom}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {customTo ? format(customTo, 'dd/MM/yyyy') : 'Até'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customTo}
                  onSelect={setCustomTo}
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* ─── Resumo do Período ────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Dias estudados', value: `${filteredStats.daysStudied}/${filteredStats.totalDays}` },
            { label: 'Total revisões', value: filteredStats.totalCards.toLocaleString() },
            { label: 'Média/dia', value: String(filteredStats.avgCards) },
          ].map(item => (
            <Card key={item.label} className="p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{item.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.label}</p>
            </Card>
          ))}
        </div>

        {/* ─── Horas Estudadas ────────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle
            title="Horas Estudadas"
            icon={<Timer className="h-4 w-4 text-primary" />}
            info="Tempo total de estudo calculado a partir da duração real de cada revisão no período selecionado."
          />
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-primary">{totalHours}</span>
            <span className="text-sm text-muted-foreground font-medium">h</span>
            <span className="text-xl font-bold tabular-nums text-primary">{totalRemainingMins}</span>
            <span className="text-sm text-muted-foreground font-medium">min</span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Média: <strong className="text-foreground">{formatMinutes(filteredStats.avgMinutes)}/dia</strong></span>
            <span>{filteredStats.daysStudied} dias ativos</span>
          </div>
          {hoursChartData.length > 1 && (
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hoursChartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} width={28} tickLine={false} axisLine={false} />
                  <RTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    formatter={(val: number) => [`${val} min`, 'Tempo']}
                  />
                  <Bar dataKey="minutes" name="Minutos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* ─── Ranking Global ────────────────────── */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-4 pb-2 flex items-center justify-between">
            <SectionTitle title="Ranking Global" icon={<Trophy className="h-4 w-4 text-warning" />} info="Usuários participantes do ranking, ordenados pelos últimos 30 dias." />
            <button onClick={() => setRankingConfigOpen(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Settings2 className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 pb-3 flex gap-2">
            {rankingSortOptions.map(opt => {
              const Icon = opt.icon;
              const active = rankingSort === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setRankingSort(opt.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {rankingLoading ? (
            <div className="px-4 pb-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !sortedRanking || sortedRanking.length === 0 ? (
            <div className="px-4 pb-4 text-center py-6">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum participante ainda</p>
            </div>
          ) : (
            <div className="border-t border-border/40 pb-1">
              {sortedRanking.slice(0, 3).map((entry, i) => {
                const isMe = entry.user_id === user?.id;
                const pos = i + 1;
                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-b-0',
                      isMe && 'bg-primary/5',
                    )}
                  >
                    <RankMedal position={pos} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm truncate', isMe ? 'font-semibold text-primary' : 'font-medium')}>
                        {entry.user_name || 'Usuário'}
                        {isMe && <span className="text-[10px] text-muted-foreground ml-1">(você)</span>}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums font-bold text-foreground">
                      {getRankValue(entry)}
                    </span>
                  </div>
                );
              })}
              {myRankEntry && myRank !== undefined && myRank >= 3 && (
                <>
                  <div className="px-4 py-1.5 text-center">
                    <span className="text-[10px] text-muted-foreground">•••</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-t border-border/20">
                    <div className="flex h-7 w-7 items-center justify-center">
                      <span className="text-xs font-bold tabular-nums text-muted-foreground">{myRank + 1}º</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate font-semibold text-primary">
                        {myRankEntry.user_name || 'Usuário'}
                        <span className="text-[10px] text-muted-foreground ml-1">(você)</span>
                      </p>
                    </div>
                    <span className="text-xs tabular-nums font-bold text-foreground">
                      {getRankValue(myRankEntry)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Ranking config dialog */}
        <Dialog open={rankingConfigOpen} onOpenChange={setRankingConfigOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Configurações do Ranking
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Participar do ranking global</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isPublic ? 'Seu nome aparece no ranking' : 'Ative para participar'}
                  </p>
                </div>
                <Switch
                  checked={isPublic}
                  onCheckedChange={(checked) => togglePublic.mutate(checked)}
                  disabled={togglePublic.isPending}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Ao participar, seu nome e estatísticas de estudo dos últimos 30 dias ficam visíveis para outros usuários no ranking.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Heatmap ──────────────────────────── */}
        <Card className="p-4 space-y-2">
          <SectionTitle title="Atividade" info="Mapa de calor dos últimos meses. Cada quadrado representa um dia — quanto mais escuro, mais cards você revisou naquele dia." />
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex ml-5" style={{ gap: 0 }}>
              {heatmapData.months.map((m, i) => {
                const nextCol = heatmapData.months[i + 1]?.colStart ?? heatmapData.weeks.length;
                const span = nextCol - m.colStart;
                return (
                  <span key={`${m.label}-${m.colStart}`} className="text-[9px] text-muted-foreground" style={{ width: span * 13, flexShrink: 0 }}>
                    {m.label}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-0">
              <div className="flex flex-col gap-[2px] mr-1 justify-start">
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="text-[8px] text-muted-foreground leading-none" style={{ height: 11, display: 'flex', alignItems: 'center' }}>{d}</span>
                ))}
              </div>
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
            <div className="flex items-center gap-1 mt-2 justify-end">
              <span className="text-[9px] text-muted-foreground mr-1">Menos</span>
              {[0, 1, 2, 3, 4].map(level => (
                <div key={level} className={cn('w-[11px] h-[11px] rounded-[2px]', level === 0 && 'bg-muted/60', level === 1 && 'bg-primary/20', level === 2 && 'bg-primary/40', level === 3 && 'bg-primary/70', level === 4 && 'bg-primary')} />
              ))}
              <span className="text-[9px] text-muted-foreground ml-1">Mais</span>
            </div>
          </div>
        </Card>

        {/* ─── Retenção ────── */}
        <Card className="p-4 space-y-2">
          <SectionTitle title="Retenção" info={"Esse número mostra a % de vezes que você acertou um cartão ao revisá-lo nos últimos 30 dias.\n\nO ideal é ficar entre 80% e 95%."} />
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold text-primary tabular-nums">{stats.trueRetention.rate}%</p>
            <div className="flex-1 space-y-1">
              <Progress value={stats.trueRetention.rate} className="h-2.5" />
              <p className="text-[11px] text-muted-foreground">{stats.trueRetention.correct} acertos de {stats.trueRetention.total} revisões</p>
            </div>
          </div>
        </Card>

        {/* ─── Respostas ────── */}
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

        {/* ─── Contagem de Cartões ────────────────────── */}
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

        {/* ─── Intervals ──────────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="Intervalos" info={"O intervalo é o tempo entre uma revisão e a próxima de cada cartão.\n\n• p50 — Metade dos seus cartões tem intervalo menor que esse valor.\n• p95 — 95% dos cartões tem intervalo menor que esse.\n• Máx — O maior intervalo entre todos seus cartões."} />
          <div className="flex gap-1.5 flex-wrap">
            <StatBadge label="p50" value={`${intervalPercentiles.p50}d`} />
            <StatBadge label="p95" value={`${intervalPercentiles.p95}d`} />
            <StatBadge label="Máx" value={`${intervalPercentiles.max}d`} />
          </div>
          <MiniBarChart data={intervalBuckets} color="hsl(var(--primary))" />
        </Card>

        {/* ─── Stability + Difficulty */}
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

        {/* ─── Retrievability ─────────────────── */}
        <Card className="p-4 space-y-3">
          <SectionTitle title="Recuperabilidade" info={"Probabilidade estimada de você lembrar cada cartão agora.\n\n• 95%+ — Provavelmente lembra.\n• 70-85% — Hora de revisar.\n• Abaixo de 50% — Provavelmente esqueceu."} />
          <MiniBarChart data={retrievabilityBuckets} color="hsl(var(--chart-4))" />
        </Card>

        {/* ─── Carga Prevista — link to /plano ─── */}
        <Card className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/plano')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Carga Prevista</p>
              <p className="text-[10px] text-muted-foreground">Veja a previsão de revisões dos próximos dias</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Card>
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
