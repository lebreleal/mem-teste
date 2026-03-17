/**
 * useStatsData — All data-fetching + derived computations for StatsPage.
 * Extracted from StatsPage.tsx (copy-paste integral).
 */

import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchActivityBreakdown, fetchHourlyBreakdown, fetchRetentionOverTime, fetchCardsAddedPerDay } from '@/services/studyService';
import { useCardStatistics } from '@/hooks/useCardStatistics';
import { useDecks } from '@/hooks/useDecks';
import { useProfile } from '@/hooks/useProfile';
import { useRanking, useTogglePublicProfile } from '@/hooks/useRanking';
import { formatMinutes } from '@/lib/utils';
import {
  format, eachDayOfInterval, getDay, subDays, startOfWeek, startOfDay,
} from 'date-fns';
import { getToday } from '@/lib/dateUtils';

// ─── Types ────────────────────────────────────────────

export type PeriodKey = 'all' | 'today' | '7d' | '1m' | '3m' | '1y' | 'custom';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string; description: string }[] = [
  { key: 'all', label: 'Tudo', description: 'Todo o histórico' },
  { key: 'today', label: 'Hoje', description: 'Apenas hoje' },
  { key: '7d', label: '7D', description: 'Últimos 7 dias' },
  { key: '1m', label: '1M', description: 'Últimos 30 dias' },
  { key: '3m', label: '3M', description: 'Últimos 3 meses' },
  { key: '1y', label: '1A', description: 'Último ano' },
  { key: 'custom', label: 'Personalizado', description: 'Período customizado' },
];

// ─── Helpers ──────────────────────────────────────────

export function bucketize(values: number[], ranges: { label: string; min: number; max: number }[]) {
  return ranges.map(r => ({
    label: r.label,
    count: values.filter(v => v >= r.min && v < r.max).length,
  }));
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

/** Shape of a single day entry from activity breakdown */
export interface DayEntry {
  cards: number;
  minutes: number;
  newCards?: number;
}

export function filterDayMap(dayMap: Record<string, DayEntry>, range: { from: Date | null; to: Date | null }) {
  if (!range.from) return dayMap;
  const fromStr = format(range.from, 'yyyy-MM-dd');
  const toStr = range.to ? format(range.to, 'yyyy-MM-dd') : '9999-12-31';
  const filtered: Record<string, DayEntry> = {};
  for (const [key, val] of Object.entries(dayMap)) {
    if (key >= fromStr && key <= toStr) {
      filtered[key] = val;
    }
  }
  return filtered;
}

export function computeFilteredStats(filteredMap: Record<string, DayEntry>, range: { from: Date | null; to: Date | null; expectedDays?: number }, totalDayMap: Record<string, DayEntry>) {
  const entries = Object.values(filteredMap);
  const totalCards = entries.reduce((s, d) => s + (Number(d.cards) || 0), 0);
  const totalMinutes = entries.reduce((s, d) => s + (Number(d.minutes) || 0), 0);
  const daysStudied = entries.filter(d => (Number(d.cards) || 0) > 0).length;
  const totalDays = range.expectedDays || (range.from ? Math.max(1, Math.ceil((range.to!.getTime() - range.from.getTime()) / 86400000) + 1) : Math.max(1, Object.keys(totalDayMap).length));
  const avgCards = daysStudied > 0 ? Math.round(totalCards / daysStudied) : 0;
  const avgMinutes = daysStudied > 0 ? Math.round(totalMinutes / daysStudied) : 0;
  return { totalCards, totalMinutes, daysStudied, totalDays, avgCards, avgMinutes };
}

// ─── Per-chart period filter ──────────────────────────

export function usePeriodFilter() {
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const range = useMemo(() => {
    const todayStr = getToday();
    const today = new Date(todayStr + 'T03:00:00Z');
    switch (period) {
      case 'today': return { from: today, to: today, expectedDays: 1 };
      case '7d': return { from: subDays(today, 6), to: today, expectedDays: 7 };
      case '1m': return { from: subDays(today, 29), to: today, expectedDays: 30 };
      case '3m': return { from: subDays(today, 89), to: today, expectedDays: 90 };
      case '1y': return { from: subDays(today, 364), to: today, expectedDays: 365 };
      case 'custom': {
        const f = customFrom ? startOfDay(customFrom) : subDays(today, 364);
        const t = customTo ? startOfDay(customTo) : today;
        const diff = Math.max(1, Math.ceil((t.getTime() - f.getTime()) / 86400000) + 1);
        return { from: f, to: t, expectedDays: diff };
      }
      default: return { from: null, to: today, expectedDays: 0 };
    }
  }, [period, customFrom, customTo]);

  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

// ─── Main data hook ───────────────────────────────────

export function useStatsData() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useCardStatistics();
  const { decks } = useDecks();
  const profile = useProfile();
  const { data: ranking, isLoading: rankingLoading } = useRanking();
  const togglePublic = useTogglePublicProfile();
  const isPublic = profile.data?.is_profile_public ?? true;

  const [rankingSort, setRankingSort] = useState<'cards' | 'hours' | 'streak'>('cards');
  const [rankingConfigOpen, setRankingConfigOpen] = useState(false);
  const [streakInfoOpen, setStreakInfoOpen] = useState(false);
  const [todayCardsInfoOpen, setTodayCardsInfoOpen] = useState(false);
  const [todayTimeInfoOpen, setTodayTimeInfoOpen] = useState(false);

  // Individual period filters per chart
  const hoursFilter = usePeriodFilter();
  const heatmapFilter = usePeriodFilter();
  const summaryFilter = usePeriodFilter();
  const reviewsPerDayFilter = usePeriodFilter();
  const addedVsReviewedFilter = usePeriodFilter();

  // Activity data from RPC
  const { data: activityData } = useQuery({
    queryKey: ['activity-full', user?.id],
    queryFn: () => fetchActivityBreakdown(user!.id, 365),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Hourly breakdown RPC
  const { data: hourlyData } = useQuery({
    queryKey: ['hourly-breakdown', user?.id],
    queryFn: () => fetchHourlyBreakdown(user!.id, 30),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: retentionOverTime } = useQuery({
    queryKey: ['retention-over-time', user?.id],
    queryFn: () => fetchRetentionOverTime(user!.id, 180),
    enabled: !!user,
    staleTime: 120_000,
  });

  // Cards added per day RPC
  const { data: cardsAddedData } = useQuery({
    queryKey: ['cards-added-per-day', user?.id],
    queryFn: () => fetchCardsAddedPerDay(user!.id, 90),
    enabled: !!user,
    staleTime: 120_000,
  });

  const todayKey = getToday();
  const dayMap: Record<string, DayEntry> = activityData?.dayMap ?? {};
  const currentStreak = activityData?.streak ?? 0;

  // Filtered data per section
  const summaryFiltered = useMemo(() => filterDayMap(dayMap, summaryFilter.range), [dayMap, summaryFilter.range]);
  const summaryStats = useMemo(() => computeFilteredStats(summaryFiltered, summaryFilter.range, dayMap), [summaryFiltered, summaryFilter.range, dayMap]);

  const hoursFiltered = useMemo(() => filterDayMap(dayMap, hoursFilter.range), [dayMap, hoursFilter.range]);
  const hoursStats = useMemo(() => computeFilteredStats(hoursFiltered, hoursFilter.range, dayMap), [hoursFiltered, hoursFilter.range, dayMap]);

  const hoursChartData = useMemo(() => {
    const entries = Object.entries(hoursFiltered)
      .map(([key, val]) => ({ date: key, minutes: Number(val.minutes) || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length > 60) {
      const weeks: Record<string, number> = {};
      entries.forEach(e => {
        const weekStart = format(startOfWeek(new Date(e.date), { weekStartsOn: 0 }), 'dd/MM');
        weeks[weekStart] = (weeks[weekStart] || 0) + e.minutes;
      });
      return Object.entries(weeks).map(([label, minutes]) => ({ label, minutes }));
    }
    return entries.map(e => ({ label: format(new Date(e.date), 'dd/MM'), minutes: e.minutes }));
  }, [hoursFiltered]);

  // Reviews per day chart data
  const reviewsPerDayFiltered = useMemo(() => filterDayMap(dayMap, reviewsPerDayFilter.range), [dayMap, reviewsPerDayFilter.range]);
  const reviewsPerDayChartData = useMemo(() => {
    const entries = Object.entries(reviewsPerDayFiltered)
      .map(([key, val]) => ({
        date: key,
        label: format(new Date(key), 'dd/MM'),
        cards: Number(val.cards) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length > 60) {
      const weeks: Record<string, number> = {};
      entries.forEach(e => {
        const weekStart = format(startOfWeek(new Date(e.date), { weekStartsOn: 0 }), 'dd/MM');
        weeks[weekStart] = (weeks[weekStart] || 0) + e.cards;
      });
      return Object.entries(weeks).map(([label, cards]) => ({ label, cards }));
    }
    return entries;
  }, [reviewsPerDayFiltered]);

  // Retention over time chart data
  const retentionChartData = useMemo(() => {
    if (!retentionOverTime || retentionOverTime.length === 0) return [];
    return retentionOverTime.map((row) => ({
      label: format(new Date(row.week_start), 'dd/MM'),
      rate: row.total_reviews > 0 ? Math.round(row.retention * 100) : 0,
      total: row.total_reviews,
    }));
  }, [retentionOverTime]);

  // Cards added vs first-time studied chart data (daily, filtered by period)
  const addedVsReviewedData = useMemo(() => {
    if (!cardsAddedData) return [];
    const addedMap = new Map<string, number>();
    cardsAddedData.forEach((row) => addedMap.set(row.date, Number(row.count) || 0));

    const { from, to } = addedVsReviewedFilter.range;
    const fromDate = from ?? subDays(new Date(), 6);
    const toDate = to ?? new Date();
    const days = eachDayOfInterval({ start: fromDate, end: toDate });

    // For large ranges (>60 days), group by week
    if (days.length > 60) {
      const weeks: Record<string, { added: number; studied: number }> = {};
      days.forEach(day => {
        const d = format(day, 'yyyy-MM-dd');
        const weekLabel = format(startOfWeek(day, { weekStartsOn: 0 }), 'dd/MM');
        if (!weeks[weekLabel]) weeks[weekLabel] = { added: 0, studied: 0 };
        weeks[weekLabel].added += addedMap.get(d) ?? 0;
        weeks[weekLabel].studied += dayMap[d]?.newCards ?? 0;
      });
      return Object.entries(weeks).map(([label, vals]) => ({
        label, added: vals.added, studied: vals.studied,
      }));
    }

    return days.map(day => {
      const d = format(day, 'yyyy-MM-dd');
      return {
        label: format(day, 'dd/MM'),
        added: addedMap.get(d) ?? 0,
        studied: dayMap[d]?.newCards ?? 0,
      };
    });
  }, [cardsAddedData, dayMap, addedVsReviewedFilter.range]);

  // Avg time per card (weekly)
  const avgTimePerCardData = useMemo(() => {
    const today = new Date();
    const weekGroups: Record<string, { totalSec: number; totalCards: number }> = {};
    for (let i = 0; i < 90; i++) {
      const d = format(subDays(today, i), 'yyyy-MM-dd');
      const entry = dayMap[d];
      if (!entry || !entry.cards || entry.cards === 0) continue;
      const weekStart = format(startOfWeek(new Date(d), { weekStartsOn: 0 }), 'dd/MM');
      if (!weekGroups[weekStart]) weekGroups[weekStart] = { totalSec: 0, totalCards: 0 };
      weekGroups[weekStart].totalSec += (Number(entry.minutes) || 0) * 60;
      weekGroups[weekStart].totalCards += Number(entry.cards) || 0;
    }
    return Object.entries(weekGroups)
      .map(([label, v]) => ({
        label,
        avgSeconds: v.totalCards > 0 ? Math.round(v.totalSec / v.totalCards) : 0,
      }))
      .reverse(); // chronological order
  }, [dayMap]);

  // Hourly chart data (0-23h)
  const hourlyChartData = useMemo(() => {
    const hourMap: Record<number, { total: number; correct: number }> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = { total: 0, correct: 0 };
    if (hourlyData && Array.isArray(hourlyData)) {
      hourlyData.forEach((row) => {
        const h = Number(row.hour);
        if (h >= 0 && h < 24) {
          hourMap[h] = { total: Number(row.cards) || 0, correct: Number(row.minutes) || 0 };
        }
      });
    }
    return Array.from({ length: 24 }, (_, h) => ({
      label: `${h}h`,
      total: hourMap[h].total,
      successRate: hourMap[h].total > 0 ? Math.round((hourMap[h].correct / hourMap[h].total) * 100) : 0,
    }));
  }, [hourlyData]);

  const todayStats = dayMap[todayKey];
  const todayCards = todayStats?.cards ?? 0;
  const todayMinutes = todayStats?.minutes ?? 0;

  // Sorted ranking
  const sortedRanking = useMemo(() => {
    if (!ranking) return [];
    const copy = [...ranking];
    if (rankingSort === 'hours') copy.sort((a, b) => b.minutes_30d - a.minutes_30d);
    else if (rankingSort === 'streak') copy.sort((a, b) => b.current_streak - a.current_streak);
    else copy.sort((a, b) => b.cards_30d - a.cards_30d);
    return copy;
  }, [ranking, rankingSort]);

  // Heatmap
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

  // Distributions
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

  // Estimated total knowledge
  const estimatedKnowledge = useMemo(() => {
    if (!stats) return { count: 0, avgRetrievability: 0 };
    const dist = stats.retrievabilityDistribution;
    const reviewedCards = stats.cardCounts.total - stats.cardCounts.new;
    const avgRetrievability = dist.length > 0 ? Math.round(dist.reduce((a, b) => a + b, 0) / dist.length) : 0;
    return { count: Math.round((avgRetrievability / 100) * reviewedCards), avgRetrievability };
  }, [stats]);

  const getRankValue = (entry: typeof sortedRanking[0]) => {
    if (rankingSort === 'hours') return formatMinutes(entry.minutes_30d);
    if (rankingSort === 'streak') return `${entry.current_streak} dias`;
    return `${entry.cards_30d.toLocaleString()} cards`;
  };

  return {
    user, stats, isLoading, decks, profile, ranking, rankingLoading,
    togglePublic, isPublic,
    rankingSort, setRankingSort, rankingConfigOpen, setRankingConfigOpen,
    streakInfoOpen, setStreakInfoOpen,
    todayCardsInfoOpen, setTodayCardsInfoOpen,
    todayTimeInfoOpen, setTodayTimeInfoOpen,
    hoursFilter, heatmapFilter, summaryFilter, reviewsPerDayFilter, addedVsReviewedFilter,
    dayMap, currentStreak, todayCards, todayMinutes,
    summaryStats, hoursStats, hoursChartData,
    reviewsPerDayChartData, retentionChartData,
    addedVsReviewedData, avgTimePerCardData, hourlyChartData,
    sortedRanking, heatmapData,
    intervalBuckets, stabilityBuckets, difficultyBuckets, retrievabilityBuckets,
    intervalPercentiles, estimatedKnowledge,
    getRankValue,
  };
}
