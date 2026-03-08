import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useMemo, useCallback } from 'react';
import { computeNewCardAllocation, calculateRealStudyTime, deriveAvgSecondsPerCard, type RealStudyMetrics, DEFAULT_STUDY_METRICS } from '@/lib/studyUtils';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = typeof DAY_KEYS[number];
export type WeeklyMinutes = Record<DayKey, number>;
export type WeeklyNewCards = Record<DayKey, number>;

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
};

export interface StudyPlan {
  id: string;
  user_id: string;
  name: string;
  daily_minutes: number;
  weekly_minutes: WeeklyMinutes | null;
  deck_ids: string[];
  target_date: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

/** Global capacity helpers - use profile-level capacity */
export function getMinutesForDayGlobal(dailyMin: number, weeklyMin: WeeklyMinutes | null, day?: DayKey): number {
  const d = day ?? (DAY_KEYS[new Date().getDay()] as DayKey);
  if (weeklyMin && weeklyMin[d] != null) return weeklyMin[d];
  return dailyMin;
}

/** @deprecated use getMinutesForDayGlobal */
export function getMinutesForDay(plan: StudyPlan, day?: DayKey): number {
  return getMinutesForDayGlobal(plan.daily_minutes, plan.weekly_minutes, day);
}

export function getWeeklyAvgMinutesGlobal(dailyMin: number, weeklyMin: WeeklyMinutes | null): number {
  if (!weeklyMin) return dailyMin;
  const vals = DAY_KEYS.map(d => weeklyMin[d] ?? dailyMin);
  return Math.round(vals.reduce((a, b) => a + b, 0) / 7);
}

export function getNewCardsForDayGlobal(dailyLimit: number, weeklyNewCards: WeeklyNewCards | null, day?: DayKey): number {
  const d = day ?? (DAY_KEYS[new Date().getDay()] as DayKey);
  if (weeklyNewCards && typeof weeklyNewCards[d] === 'number') return weeklyNewCards[d];
  return dailyLimit;
}

export function getWeeklyAvgNewCardsGlobal(dailyLimit: number, weeklyNewCards: WeeklyNewCards | null): number {
  if (!weeklyNewCards) return dailyLimit;
  const vals = DAY_KEYS.map(d => weeklyNewCards[d] ?? dailyLimit);
  return Math.round(vals.reduce((a, b) => a + b, 0) / 7);
}

/** @deprecated use getWeeklyAvgMinutesGlobal */
export function getWeeklyAvgMinutes(plan: StudyPlan): number {
  return getWeeklyAvgMinutesGlobal(plan.daily_minutes, plan.weekly_minutes);
}

export interface WeeklyCardDataPoint {
  day: string;
  review: number;
  newCards: number;
  total: number;
  minutes: number;
}

export interface ForecastDataPoint {
  day: string;
  dayKey: DayKey;
  reviewMin: number;
  newMin: number;
  totalMin: number;
  capacityMin: number;
  overloaded: boolean;
  reviewCards: number;
  newCards: number;
}

export interface PlanMetrics {
  totalNew: number;
  totalReview: number;
  totalLearning: number;
  avgSecondsPerCard: number;
  cardsPerDay: number;
  cardsPerWeek: number;
  requiredCardsPerDay: number | null;
  daysRemaining: number | null;
  coveragePercent: number | null;
  healthStatus: 'green' | 'yellow' | 'orange' | 'red';
  estimatedMinutesToday: number;
  reviewMinutes: number;
  newMinutes: number;
  planHealthPercent: number | null;
  avgRetention: number;
  todayCapacityMinutes: number;
  capacityCardsToday: number;
  projectedCompletionDate: string | null;
  weeklyCardData: WeeklyCardDataPoint[];
  forecastData: ForecastDataPoint[];
  dailyNewCards: number;
  newCardsAllocation: Record<string, number>;
  deckNewAllocation: Record<string, number>;
}

export function useStudyPlan(options?: { full?: boolean }) {
  const full = options?.full ?? false;
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  // ─── Fetch ALL plans (objectives) for the user ───
  const plansQuery = useQuery({
    queryKey: ['study-plans', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plans' as any)
        .select('*')
        .eq('user_id', userId!)
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data as unknown as StudyPlan[]) ?? [];
    },
    enabled: !!userId,
  });

  // ─── Use centralized profile for global capacity ───
  const profileQuery = useProfile();
  const globalCapacity = useMemo(() => {
    const p = profileQuery.data;
    if (!p) return { dailyMinutes: 60, weeklyMinutes: null, dailyNewCardsLimit: 30, weeklyNewCards: null };
    return {
      dailyMinutes: p.daily_study_minutes ?? 60,
      weeklyMinutes: p.weekly_study_minutes as WeeklyMinutes | null,
      dailyNewCardsLimit: p.daily_new_cards_limit ?? 30,
      weeklyNewCards: p.weekly_new_cards as WeeklyNewCards | null,
    };
  }, [profileQuery.data]);

  const plans = plansQuery.data ?? [];

  // ─── Deck hierarchy from shared cache (avoids duplicate query) ───
  const cachedDecks = qc.getQueryData<any[]>(['decks', userId]);
  const deckHierarchy = useMemo(() => {
    if (!cachedDecks) return [];
    return cachedDecks
      .filter((d: any) => !d.is_archived)
      .map((d: any) => ({ id: d.id as string, parent_deck_id: d.parent_deck_id as string | null }));
  }, [cachedDecks]);

  const findRoot = useCallback((id: string): string => {
    const deck = deckHierarchy.find(d => d.id === id);
    if (!deck || !deck.parent_deck_id) return id;
    return findRoot(deck.parent_deck_id);
  }, [deckHierarchy]);

  // ─── Aggregate all deck_ids from all objectives (deduplicated) ───
  // When no plans exist, use all active root deck IDs for simulation
  const allDeckIds = useMemo(() => {
    if (plans.length > 0) {
      const ids = new Set<string>();
      for (const p of plans) {
        for (const id of (p.deck_ids ?? [])) ids.add(id);
      }
      return Array.from(ids);
    }
    // No plans: use all root decks (no parent)
    return deckHierarchy.filter(d => !d.parent_deck_id).map(d => d.id);
  }, [plans, deckHierarchy]);

  const realMetricsQuery = useQuery({
    queryKey: ['real-study-metrics', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_real_study_metrics' as any, { p_user_id: userId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return DEFAULT_STUDY_METRICS;
      return {
        avgNewSeconds: Number(row.avg_new_seconds) || DEFAULT_STUDY_METRICS.avgNewSeconds,
        avgLearningSeconds: Number(row.avg_learning_seconds) || DEFAULT_STUDY_METRICS.avgLearningSeconds,
        avgReviewSeconds: Number(row.avg_review_seconds) || DEFAULT_STUDY_METRICS.avgReviewSeconds,
        avgRelearningSeconds: Number(row.avg_relearning_seconds) || DEFAULT_STUDY_METRICS.avgRelearningSeconds,
        actualDailyMinutes: Number(row.actual_daily_minutes) || DEFAULT_STUDY_METRICS.actualDailyMinutes,
        totalReviews90d: Number(row.total_reviews_90d) || 0,
      } as RealStudyMetrics;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  // Collect descendant IDs for plan decks (so we count new cards across the whole tree)
  const expandedDeckIds = useMemo(() => {
    if (deckHierarchy.length === 0) return allDeckIds;
    const result = new Set<string>(allDeckIds);
    const collectDescendants = (parentId: string) => {
      for (const d of deckHierarchy) {
        if (d.parent_deck_id === parentId && !result.has(d.id)) {
          result.add(d.id);
          collectDescendants(d.id);
        }
      }
    };
    for (const id of allDeckIds) collectDescendants(id);
    return Array.from(result);
  }, [allDeckIds, deckHierarchy]);

  // ─── Metrics using ALL deck_ids including descendants (consolidated) ───
  const metricsQuery = useQuery({
    queryKey: ['plan-metrics', userId, expandedDeckIds],
    queryFn: async () => {
      if (expandedDeckIds.length === 0) return { total_new: 0, total_review: 0, total_learning: 0 };
      const { data, error } = await supabase.rpc('get_plan_metrics' as any, {
        p_user_id: userId,
        p_deck_ids: expandedDeckIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? { total_new: 0, total_review: 0, total_learning: 0 };
    },
    enabled: !!userId && expandedDeckIds.length > 0,
  });

  // ─── Per-deck new card counts for proportional allocation ───
  // Reuse the deck stats from the shared ['decks'] cache instead of calling
  // get_all_user_deck_stats a second time. The useDecks hook already fetches
  // this data and shares it via staleTime, so we just read from the cache.
  const perDeckStatsQuery = useQuery({
    queryKey: ['per-deck-new-counts', userId, expandedDeckIds],
    queryFn: async () => {
      if (allDeckIds.length === 0) return {} as Record<string, number>;
      // Try to read from decks cache first (populated by useDecks → fetchDecksWithStats)
      const cachedDecks = qc.getQueryData<any[]>(['decks', userId]);
      let rows: { deck_id: string; new_count: number }[];
      if (cachedDecks && cachedDecks.length > 0) {
        rows = cachedDecks.map((d: any) => ({ deck_id: d.id, new_count: d.new_count ?? 0 }));
      } else {
        // Fallback: fetch directly (only on cold start before useDecks populates)
        const { data, error } = await supabase.rpc('get_all_user_deck_stats' as any, { p_user_id: userId });
        if (error) throw error;
        rows = (data as any[]) ?? [];
      }
      const map: Record<string, number> = {};
      const expandedSet = new Set(expandedDeckIds);
      for (const row of rows) {
        if (expandedSet.has(row.deck_id)) {
          const rootId = findRoot(row.deck_id);
          map[rootId] = (map[rootId] ?? 0) + (Number(row.new_count) || 0);
        }
      }
      return map;
    },
    enabled: !!userId && allDeckIds.length > 0,
    staleTime: 2 * 60_000,
  });

  const retentionQuery = useQuery({
    queryKey: ['plan-retention', allDeckIds],
    queryFn: async () => {
      if (allDeckIds.length === 0) return 0.9;
      const { data, error } = await supabase
        .from('decks')
        .select('requested_retention')
        .in('id', allDeckIds);
      if (error) throw error;
      if (!data || data.length === 0) return 0.9;
      const sum = data.reduce((acc: number, d: any) => acc + (d.requested_retention ?? 0.9), 0);
      return sum / data.length;
    },
    enabled: full && allDeckIds.length > 0,
    staleTime: 5 * 60_000,
  });

  // ─── Plan health: lightweight estimate using plan age + recent activity ───
  const planHealthQuery = useQuery({
    queryKey: ['plan-health', userId, plans.length],
    queryFn: async () => {
      if (plans.length === 0) return null;
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const { count, error } = await supabase
        .from('review_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .gte('reviewed_at', since.toISOString());
      if (error) throw error;
      const activeDays = Math.min(14, Math.ceil((count ?? 0) / 5));
      return Math.min(100, Math.round((activeDays / 14) * 100));
    },
    enabled: full && !!userId && plans.length > 0,
    staleTime: 10 * 60_000,
  });

  // ─── 7-day forecast: count scheduled cards per day (lightweight) ───
  const forecastQuery = useQuery({
    queryKey: ['plan-forecast', userId, allDeckIds],
    queryFn: async () => {
      if (allDeckIds.length === 0) return [];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const { data, error } = await supabase
        .from('cards')
        .select('scheduled_date')
        .in('deck_id', allDeckIds)
        .eq('state', 2)
        .gte('scheduled_date', startDate.toISOString())
        .lte('scheduled_date', endDate.toISOString());
      if (error) throw error;
      return (data ?? []) as { scheduled_date: string }[];
    },
    enabled: full && !!userId && allDeckIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // ─── Consolidated metrics (global) ───
  const computed = useMemo<PlanMetrics | null>(() => {
    if (!realMetricsQuery.data || !metricsQuery.data || !perDeckStatsQuery.data) return null;
    const raw = metricsQuery.data;
    const rm = realMetricsQuery.data;
    const avg = deriveAvgSecondsPerCard(rm);

    const totalNew = Number(raw.total_new) || 0;
    const totalReview = Number(raw.total_review) || 0;
    const totalLearning = Number(raw.total_learning) || 0;

    const todayCapacityMinutes = getMinutesForDayGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes);
    const avgDailyMinutes = getWeeklyAvgMinutesGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes);

    const cardsPerDay = Math.floor((avgDailyMinutes * 60) / avg);
    const capacityCardsToday = Math.floor((todayCapacityMinutes * 60) / avg);
    const cardsPerWeek = cardsPerDay * 7;

    const estimatedReviewsToday = totalReview > 0
      ? Math.min(totalReview, capacityCardsToday)
      : Math.min(totalLearning, Math.ceil(capacityCardsToday * 0.3));
    const reviewSeconds = calculateRealStudyTime(0, totalLearning, estimatedReviewsToday, rm);
    const reviewMinutes = Math.round(reviewSeconds / 60);
    const remainingCapacity = Math.max(0, capacityCardsToday - estimatedReviewsToday);

    // ─── Smart new card allocation (shared pure function) ───
    const globalNewBudget = getNewCardsForDayGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards);
    const perDeckNewCounts = perDeckStatsQuery.data ?? {};

    let deckNewAllocation: Record<string, number> = {};
    let newCardsAllocation: Record<string, number> = {};

    if (plans.length > 0) {
      const allocation = computeNewCardAllocation({
        globalBudget: globalNewBudget,
        plans: plans.map(p => ({ id: p.id, deck_ids: p.deck_ids, target_date: p.target_date, priority: p.priority })),
        newPerRoot: perDeckNewCounts,
        findRoot,
      });
      deckNewAllocation = allocation.perDeck;
      newCardsAllocation = allocation.perPlan;
    }

    const dailyNewCards = Math.min(globalNewBudget, totalNew);
    const newSeconds = estimateStudySeconds(dailyNewCards, 0, 0, avg);
    const maxNewMinutes = Math.max(0, todayCapacityMinutes - reviewMinutes);
    const newMinutes = Math.min(Math.round(newSeconds / 60), maxNewMinutes);
    const estimatedMinutesToday = reviewMinutes + newMinutes;

    const totalPending = totalNew + totalReview + totalLearning;
    const reviewRatio = totalPending > 0 ? (totalReview + totalLearning) / totalPending : 0.3;
    const weeklyCardData: WeeklyCardDataPoint[] = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(dayKey => {
      const dayMinutes = getMinutesForDayGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes, dayKey);
      const dayCapacity = Math.floor((dayMinutes * 60) / avg);
      const dayNewLimit = getNewCardsForDayGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards, dayKey);
      const dayReviews = totalReview > 0
        ? Math.min(totalReview, dayCapacity)
        : Math.min(totalLearning, Math.ceil(dayCapacity * reviewRatio));
      const dayNew = Math.min(Math.min(Math.max(0, dayCapacity - dayReviews), totalNew), dayNewLimit);
      return { day: DAY_LABELS[dayKey], review: dayReviews, newCards: dayNew, total: dayReviews + dayNew, minutes: dayMinutes };
    });

    // ─── 7-day forecast ───
    const forecastCards = forecastQuery.data ?? [];
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const forecastData: ForecastDataPoint[] = Array.from({ length: 7 }, (_, i) => {
      const dayDate = new Date(todayDate);
      dayDate.setDate(dayDate.getDate() + i);
      const nextDay = new Date(dayDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayOfWeek = dayDate.getDay();
      const dayKey = DAY_KEYS[dayOfWeek];
      const dayLabel = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DAY_LABELS[dayKey];
      const dayCapacityMin = getMinutesForDayGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes, dayKey);

      let reviewCards: number;
      if (i === 0) {
        reviewCards = totalReview + totalLearning;
      } else {
        const dayStr = dayDate.toISOString().slice(0, 10);
        reviewCards = forecastCards.filter(c => c.scheduled_date.slice(0, 10) === dayStr).length;
      }

      const fcNewCards = getNewCardsForDayGlobal(globalCapacity.dailyNewCardsLimit, globalCapacity.weeklyNewCards, dayKey);
      const fcReviewMin = Math.round((reviewCards * avg) / 60);
      const fcNewMin = Math.round((fcNewCards * avg) / 60);
      const fcTotalMin = fcReviewMin + fcNewMin;

      return {
        day: dayLabel, dayKey,
        reviewMin: fcReviewMin, newMin: fcNewMin, totalMin: fcTotalMin,
        capacityMin: dayCapacityMin, overloaded: fcTotalMin > dayCapacityMin,
        reviewCards, newCards: fcNewCards,
      };
    });

    // ─── Global health: based on all objectives ───
    // Find the most urgent target_date across all plans
    let requiredCardsPerDay: number | null = null;
    let daysRemaining: number | null = null;
    let coveragePercent: number | null = null;
    let healthStatus: 'green' | 'yellow' | 'orange' | 'red' = 'green';
    let projectedCompletionDate: string | null = null;

    // Effective rate = min(card limit, cards that fit in available time after reviews)
    if (globalNewBudget > 0 && totalNew > 0) {
      const availMinForNew = Math.max(0, avgDailyMinutes - reviewMinutes);
      const cardsFitByTime = availMinForNew > 0 ? Math.floor((availMinForNew * 60) / avg) : 0;
      const effectiveRate = Math.min(globalNewBudget, cardsFitByTime);
      const rateToUse = Math.max(1, effectiveRate);
      const daysForNew = Math.ceil(totalNew / rateToUse);
      const projected = new Date();
      projected.setDate(projected.getDate() + daysForNew - 1); // today counts as day 1
      projectedCompletionDate = projected.toISOString().slice(0, 10);
    }

    // Use earliest target_date from any objective for global health
    const plansWithTarget = plans.filter(p => p.target_date);
    if (plansWithTarget.length > 0) {
      const earliest = plansWithTarget.reduce((min, p) => {
        const d = new Date(p.target_date!);
        return d < min ? d : min;
      }, new Date(plansWithTarget[0].target_date!));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysRemaining = Math.max(1, Math.ceil((earliest.getTime() - today.getTime()) / 86400000));
      requiredCardsPerDay = Math.ceil(totalPending / daysRemaining);
      coveragePercent = requiredCardsPerDay > 0 ? Math.min(100, Math.round((cardsPerDay / requiredCardsPerDay) * 100)) : 100;

      if (coveragePercent >= 100) healthStatus = 'green';
      else if (coveragePercent >= 70) healthStatus = 'yellow';
      else if (coveragePercent >= 50) healthStatus = 'orange';
      else healthStatus = 'red';
    } else {
      if (estimatedMinutesToday <= todayCapacityMinutes * 0.7) healthStatus = 'green';
      else if (estimatedMinutesToday <= todayCapacityMinutes) healthStatus = 'yellow';
      else if (estimatedMinutesToday <= todayCapacityMinutes * 1.5) healthStatus = 'orange';
      else healthStatus = 'red';
    }

    return {
      totalNew, totalReview, totalLearning,
      avgSecondsPerCard: avg,
      cardsPerDay, cardsPerWeek,
      requiredCardsPerDay, daysRemaining, coveragePercent, healthStatus,
      estimatedMinutesToday, reviewMinutes, newMinutes,
      planHealthPercent: planHealthQuery.data ?? null,
      avgRetention: retentionQuery.data ?? 0.9,
      todayCapacityMinutes, capacityCardsToday,
      projectedCompletionDate, weeklyCardData,
      forecastData, dailyNewCards, newCardsAllocation, deckNewAllocation,
    };
  }, [plans, globalCapacity, avgQuery.data, metricsQuery.data, perDeckStatsQuery.data, planHealthQuery.data, retentionQuery.data, forecastQuery.data]);

  // ─── Impact calculator (multi-objective) ───
  const calcImpact = useCallback((newMinutes: number) => {
    const avg = avgQuery.data ?? 30;
    const raw = metricsQuery.data;
    if (plans.length === 0 || !raw) return null;

    const totalPending = (Number(raw.total_new) || 0) + (Number(raw.total_review) || 0) + (Number(raw.total_learning) || 0);
    const newCardsPerDay = Math.floor((newMinutes * 60) / avg);

    const forecastCards = forecastQuery.data ?? [];
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    let peakDay: string | null = null;
    let peakMin = 0;

    for (let i = 1; i < 7; i++) {
      const dayDate = new Date(todayDate);
      dayDate.setDate(dayDate.getDate() + i);
      const dayStr = dayDate.toISOString().slice(0, 10);
      const dayOfWeek = dayDate.getDay();
      const dayKey = DAY_KEYS[dayOfWeek];
      const reviewCount = forecastCards.filter(c => c.scheduled_date.slice(0, 10) === dayStr).length;
      const dailyNew = Math.min(Math.floor((newMinutes * 60) / avg), Number(raw.total_new) || 0);
      const totalMin = Math.round(estimateStudySeconds(dailyNew, 0, reviewCount, avg) / 60);
      if (totalMin > newMinutes && totalMin > peakMin) {
        peakMin = totalMin;
        peakDay = DAY_LABELS[dayKey];
      }
    }

    // Check against earliest target date from ALL plans
    const plansWithTarget = plans.filter(p => p.target_date);
    if (plansWithTarget.length > 0) {
      const earliest = plansWithTarget.reduce((min, p) => {
        const d = new Date(p.target_date!);
        return d < min ? d : min;
      }, new Date(plansWithTarget[0].target_date!));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentDaysRemaining = Math.max(1, Math.ceil((earliest.getTime() - today.getTime()) / 86400000));
      const newDaysNeeded = newCardsPerDay > 0 ? Math.ceil(totalPending / newCardsPerDay) : 9999;
      const diff = newDaysNeeded - currentDaysRemaining;
      return { cardsPerDay: newCardsPerDay, daysDiff: diff, daysNeeded: newDaysNeeded, peakDay, peakMin };
    }
    return { cardsPerDay: newCardsPerDay, daysDiff: null, daysNeeded: null, peakDay, peakMin };
  }, [plans, avgQuery.data, metricsQuery.data, forecastQuery.data]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['study-plans'] });
    qc.invalidateQueries({ queryKey: ['study-plans-lock'] });
    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
    qc.invalidateQueries({ queryKey: ['plan-health'] });
    qc.invalidateQueries({ queryKey: ['plan-retention'] });
    qc.invalidateQueries({ queryKey: ['plan-forecast'] });
    // global-capacity removed — profile handles it
    qc.invalidateQueries({ queryKey: ['profile'] });
  }, [qc]);

  const createPlan = useMutation({
    mutationFn: async (input: { name: string; deck_ids: string[]; target_date: string | null }) => {
      const maxPriority = plans.length > 0 ? Math.max(...plans.map(p => p.priority ?? 0)) + 1 : 0;
      const { error } = await supabase.from('study_plans' as any).insert({
        user_id: userId,
        name: input.name,
        daily_minutes: globalCapacity.dailyMinutes,
        deck_ids: input.deck_ids,
        target_date: input.target_date,
        priority: maxPriority,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updatePlan = useMutation({
    mutationFn: async (input: { id: string; name?: string; deck_ids?: string[]; target_date?: string | null }) => {
      const { id, ...rest } = input;
      const { error } = await supabase
        .from('study_plans' as any)
        .update(rest as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deletePlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from('study_plans' as any).delete().eq('id', planId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // ─── Global capacity mutations (profile-level) ───
  const updateCapacity = useMutation({
    mutationFn: async (input: { daily_study_minutes: number; weekly_study_minutes?: WeeklyMinutes | null; daily_new_cards_limit?: number }) => {
      const updateData: any = {
        daily_study_minutes: input.daily_study_minutes,
        weekly_study_minutes: input.weekly_study_minutes ?? null,
      };
      if (input.daily_new_cards_limit != null) {
        updateData.daily_new_cards_limit = input.daily_new_cards_limit;
      }
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateNewCardsLimit = useMutation({
    mutationFn: async (input: { limit: number; weeklyNewCards?: WeeklyNewCards | null }) => {
      const updateData: any = { daily_new_cards_limit: input.limit };
      if (input.weeklyNewCards !== undefined) {
        updateData.weekly_new_cards = input.weeklyNewCards;
      }
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      const nextWeekly = vars.weeklyNewCards !== undefined
        ? vars.weeklyNewCards
        : (globalCapacity.weeklyNewCards ?? null);

      // Update profile cache directly (replaces both daily-new-cards-limit and global-capacity)
      qc.setQueryData(['profile', userId], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          daily_new_cards_limit: vars.limit,
          weekly_new_cards: nextWeekly,
        };
      });

      invalidate();
    },
  });

  // ─── Reorder objectives (persist priority) ───
  const reorderObjectives = useMutation({
    mutationFn: async (orderedPlanIds: string[]) => {
      const updates = orderedPlanIds.map((id, i) =>
        supabase.from('study_plans' as any).update({ priority: i } as any).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: invalidate,
  });

  return {
    plans,
    allDeckIds,
    expandedDeckIds,
    globalCapacity,
    isLoading: plansQuery.isLoading || profileQuery.isLoading,
    metrics: computed,
    avgSecondsPerCard: avgQuery.data ?? 30,
    calcImpact,
    createPlan,
    updatePlan,
    deletePlan,
    updateCapacity,
    updateNewCardsLimit,
    reorderObjectives,
  };
}
