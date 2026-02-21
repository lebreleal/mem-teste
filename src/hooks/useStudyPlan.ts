import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMemo, useCallback } from 'react';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = typeof DAY_KEYS[number];
export type WeeklyMinutes = Record<DayKey, number>;

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
}

export function useStudyPlan() {
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

  // ─── Fetch global capacity from profile ───
  const capacityQuery = useQuery({
    queryKey: ['global-capacity', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('daily_study_minutes, weekly_study_minutes')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return {
        dailyMinutes: (data as any)?.daily_study_minutes as number ?? 60,
        weeklyMinutes: (data as any)?.weekly_study_minutes as WeeklyMinutes | null,
      };
    },
    enabled: !!userId,
  });

  const plans = plansQuery.data ?? [];
  const globalCapacity = capacityQuery.data ?? { dailyMinutes: 60, weeklyMinutes: null };

  // ─── Aggregate all deck_ids from all objectives (deduplicated) ───
  const allDeckIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of plans) {
      for (const id of (p.deck_ids ?? [])) ids.add(id);
    }
    return Array.from(ids);
  }, [plans]);

  const avgQuery = useQuery({
    queryKey: ['avg-seconds-per-card', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_avg_seconds_per_card' as any, { p_user_id: userId });
      if (error) throw error;
      return Number(data) || 30;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  // ─── Metrics using ALL deck_ids (consolidated) ───
  const metricsQuery = useQuery({
    queryKey: ['plan-metrics', userId, allDeckIds],
    queryFn: async () => {
      if (allDeckIds.length === 0) return { total_new: 0, total_review: 0, total_learning: 0 };
      const { data, error } = await supabase.rpc('get_plan_metrics' as any, {
        p_user_id: userId,
        p_deck_ids: allDeckIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? { total_new: 0, total_review: 0, total_learning: 0 };
    },
    enabled: !!userId && allDeckIds.length > 0,
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
    enabled: allDeckIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const planHealthQuery = useQuery({
    queryKey: ['plan-health', userId, plans.length],
    queryFn: async () => {
      if (plans.length === 0) return null;
      const earliest = plans.reduce((min, p) => p.created_at < min ? p.created_at : min, plans[0].created_at);
      const { data, error } = await supabase
        .from('review_logs')
        .select('reviewed_at')
        .eq('user_id', userId!)
        .gte('reviewed_at', earliest);
      if (error) throw error;
      const days = new Set<string>();
      (data ?? []).forEach((r: any) => {
        days.add(new Date(r.reviewed_at).toISOString().slice(0, 10));
      });
      const totalDays = Math.max(1, Math.ceil((Date.now() - new Date(earliest).getTime()) / 86400000));
      return Math.min(100, Math.round((days.size / totalDays) * 100));
    },
    enabled: !!userId && plans.length > 0,
    staleTime: 5 * 60_000,
  });

  // ─── 7-day forecast: fetch scheduled review cards from ALL decks ───
  const forecastQuery = useQuery({
    queryKey: ['plan-forecast', userId, allDeckIds],
    queryFn: async () => {
      if (allDeckIds.length === 0) return [];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      const { data, error } = await supabase
        .from('cards')
        .select('scheduled_date')
        .in('deck_id', allDeckIds)
        .eq('state', 2)
        .lte('scheduled_date', endDate.toISOString());
      if (error) throw error;
      return (data ?? []) as { scheduled_date: string }[];
    },
    enabled: !!userId && allDeckIds.length > 0,
    staleTime: 2 * 60_000,
  });

  // ─── Consolidated metrics (global) ───
  const computed = useMemo<PlanMetrics | null>(() => {
    if (plans.length === 0 || avgQuery.data == null || !metricsQuery.data) return null;
    const raw = metricsQuery.data;
    const avg = avgQuery.data;

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
    const reviewMinutes = Math.round((estimatedReviewsToday * avg) / 60);
    const remainingCapacity = Math.max(0, capacityCardsToday - estimatedReviewsToday);

    // ─── Priority-based new card allocation ───
    const newCardsAllocation: Record<string, number> = {};
    let allocRemaining = remainingCapacity;
    const sortedPlans = [...plans].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    for (const p of sortedPlans) {
      if (allocRemaining <= 0) { newCardsAllocation[p.id] = 0; continue; }
      const planDeckCount = (p.deck_ids ?? []).length;
      const totalDeckCount = allDeckIds.length || 1;
      const planNewEstimate = Math.round(totalNew * (planDeckCount / totalDeckCount));
      const allocated = Math.min(allocRemaining, planNewEstimate);
      newCardsAllocation[p.id] = allocated;
      allocRemaining -= allocated;
    }
    const dailyNewCards = Math.min(remainingCapacity, totalNew);
    const newMinutes = Math.round((dailyNewCards * avg) / 60);
    const estimatedMinutesToday = reviewMinutes + newMinutes;

    const totalPending = totalNew + totalReview + totalLearning;
    const reviewRatio = totalPending > 0 ? (totalReview + totalLearning) / totalPending : 0.3;
    const weeklyCardData: WeeklyCardDataPoint[] = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(dayKey => {
      const dayMinutes = getMinutesForDayGlobal(globalCapacity.dailyMinutes, globalCapacity.weeklyMinutes, dayKey);
      const dayCapacity = Math.floor((dayMinutes * 60) / avg);
      const dayReviews = totalReview > 0
        ? Math.min(totalReview, dayCapacity)
        : Math.min(totalLearning, Math.ceil(dayCapacity * reviewRatio));
      const dayNew = Math.min(Math.max(0, dayCapacity - dayReviews), totalNew);
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

      const fcNewCards = dailyNewCards;
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

    if (cardsPerDay > 0 && totalPending > 0) {
      const daysNeeded = Math.ceil(totalPending / cardsPerDay);
      const projected = new Date();
      projected.setDate(projected.getDate() + daysNeeded);
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
      forecastData, dailyNewCards, newCardsAllocation,
    };
  }, [plans, globalCapacity, avgQuery.data, metricsQuery.data, planHealthQuery.data, retentionQuery.data, forecastQuery.data]);

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
      const totalCards = reviewCount + dailyNew;
      const totalMin = Math.round((totalCards * avg) / 60);
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
    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
    qc.invalidateQueries({ queryKey: ['plan-health'] });
    qc.invalidateQueries({ queryKey: ['plan-retention'] });
    qc.invalidateQueries({ queryKey: ['plan-forecast'] });
    qc.invalidateQueries({ queryKey: ['global-capacity'] });
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
    mutationFn: async (input: { daily_study_minutes: number; weekly_study_minutes?: WeeklyMinutes | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          daily_study_minutes: input.daily_study_minutes,
          weekly_study_minutes: input.weekly_study_minutes ?? null,
        } as any)
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
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
    globalCapacity,
    isLoading: plansQuery.isLoading || capacityQuery.isLoading,
    metrics: computed,
    avgSecondsPerCard: avgQuery.data ?? 30,
    calcImpact,
    createPlan,
    updatePlan,
    deletePlan,
    updateCapacity,
    reorderObjectives,
  };
}
