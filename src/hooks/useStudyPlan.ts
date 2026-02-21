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
  created_at: string;
  updated_at: string;
}

/** Get minutes for a specific day, falling back to daily_minutes */
export function getMinutesForDay(plan: StudyPlan, day?: DayKey): number {
  const d = day ?? (DAY_KEYS[new Date().getDay()] as DayKey);
  if (plan.weekly_minutes && plan.weekly_minutes[d] != null) {
    return plan.weekly_minutes[d];
  }
  return plan.daily_minutes;
}

/** Average daily minutes across the week */
export function getWeeklyAvgMinutes(plan: StudyPlan): number {
  if (!plan.weekly_minutes) return plan.daily_minutes;
  const vals = DAY_KEYS.map(d => plan.weekly_minutes![d] ?? plan.daily_minutes);
  return Math.round(vals.reduce((a, b) => a + b, 0) / 7);
}

export interface WeeklyCardDataPoint {
  day: string;
  review: number;
  newCards: number;
  total: number;
  minutes: number;
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
}

export function useStudyPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  // ─── Fetch ALL plans for the user ───
  const plansQuery = useQuery({
    queryKey: ['study-plans', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plans' as any)
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as StudyPlan[]) ?? [];
    },
    enabled: !!userId,
  });

  // ─── Fetch selected_plan_id from profile ───
  const selectedIdQuery = useQuery({
    queryKey: ['selected-plan-id', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('selected_plan_id')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return (data as any)?.selected_plan_id as string | null;
    },
    enabled: !!userId,
  });

  const plans = plansQuery.data ?? [];
  const selectedPlanId = selectedIdQuery.data;

  // Resolve the active plan: saved selection, or first plan
  const plan = useMemo<StudyPlan | null>(() => {
    if (plans.length === 0) return null;
    if (selectedPlanId) {
      const found = plans.find(p => p.id === selectedPlanId);
      if (found) return found;
    }
    return plans[0];
  }, [plans, selectedPlanId]);

  // ─── Select a different plan ───
  const selectPlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ selected_plan_id: planId } as any)
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['selected-plan-id'] });
      qc.invalidateQueries({ queryKey: ['plan-metrics'] });
      qc.invalidateQueries({ queryKey: ['plan-health'] });
      qc.invalidateQueries({ queryKey: ['plan-retention'] });
    },
  });

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

  const metricsQuery = useQuery({
    queryKey: ['plan-metrics', userId, plan?.deck_ids],
    queryFn: async () => {
      const deckIds = plan?.deck_ids ?? [];
      if (deckIds.length === 0) return { total_new: 0, total_review: 0, total_learning: 0 };
      const { data, error } = await supabase.rpc('get_plan_metrics' as any, {
        p_user_id: userId,
        p_deck_ids: deckIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? { total_new: 0, total_review: 0, total_learning: 0 };
    },
    enabled: !!userId && !!plan,
  });

  const retentionQuery = useQuery({
    queryKey: ['plan-retention', plan?.deck_ids],
    queryFn: async () => {
      const deckIds = plan?.deck_ids ?? [];
      if (deckIds.length === 0) return 0.9;
      const { data, error } = await supabase
        .from('decks')
        .select('requested_retention')
        .in('id', deckIds);
      if (error) throw error;
      if (!data || data.length === 0) return 0.9;
      const sum = data.reduce((acc: number, d: any) => acc + (d.requested_retention ?? 0.9), 0);
      return sum / data.length;
    },
    enabled: !!plan && (plan?.deck_ids?.length ?? 0) > 0,
    staleTime: 5 * 60_000,
  });

  const planHealthQuery = useQuery({
    queryKey: ['plan-health', userId, plan?.created_at],
    queryFn: async () => {
      if (!plan) return null;
      const { data, error } = await supabase
        .from('review_logs')
        .select('reviewed_at')
        .eq('user_id', userId!)
        .gte('reviewed_at', plan.created_at);
      if (error) throw error;
      const days = new Set<string>();
      (data ?? []).forEach((r: any) => {
        days.add(new Date(r.reviewed_at).toISOString().slice(0, 10));
      });
      const totalDays = Math.max(1, Math.ceil((Date.now() - new Date(plan.created_at).getTime()) / 86400000));
      return Math.min(100, Math.round((days.size / totalDays) * 100));
    },
    enabled: !!userId && !!plan,
    staleTime: 5 * 60_000,
  });

  const computed = useMemo<PlanMetrics | null>(() => {
    if (!plan || avgQuery.data == null || !metricsQuery.data) return null;
    const raw = metricsQuery.data;
    const avg = avgQuery.data;

    const totalNew = Number(raw.total_new) || 0;
    const totalReview = Number(raw.total_review) || 0;
    const totalLearning = Number(raw.total_learning) || 0;

    const todayCapacityMinutes = getMinutesForDay(plan);
    const avgDailyMinutes = getWeeklyAvgMinutes(plan);

    const cardsPerDay = Math.floor((avgDailyMinutes * 60) / avg);
    const capacityCardsToday = Math.floor((todayCapacityMinutes * 60) / avg);
    const cardsPerWeek = cardsPerDay * 7;

    const estimatedReviewsToday = totalReview > 0
      ? Math.min(totalReview, capacityCardsToday)
      : Math.min(totalLearning, Math.ceil(capacityCardsToday * 0.3));
    const reviewMinutes = Math.round((estimatedReviewsToday * avg) / 60);
    const remainingCapacity = Math.max(0, capacityCardsToday - estimatedReviewsToday);
    const dailyNewCards = Math.min(remainingCapacity, totalNew);
    const newMinutes = Math.round((dailyNewCards * avg) / 60);
    const estimatedMinutesToday = reviewMinutes + newMinutes;

    const totalPending = totalNew + totalReview + totalLearning;
    const reviewRatio = totalPending > 0 ? (totalReview + totalLearning) / totalPending : 0.3;
    const weeklyCardData: WeeklyCardDataPoint[] = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map(dayKey => {
      const dayMinutes = getMinutesForDay(plan, dayKey);
      const dayCapacity = Math.floor((dayMinutes * 60) / avg);
      const dayReviews = totalReview > 0
        ? Math.min(totalReview, dayCapacity)
        : Math.min(totalLearning, Math.ceil(dayCapacity * reviewRatio));
      const dayNew = Math.min(Math.max(0, dayCapacity - dayReviews), totalNew);
      return { day: DAY_LABELS[dayKey], review: dayReviews, newCards: dayNew, total: dayReviews + dayNew, minutes: dayMinutes };
    });

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

    if (plan.target_date) {
      const target = new Date(plan.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysRemaining = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000));
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
    };
  }, [plan, avgQuery.data, metricsQuery.data, planHealthQuery.data, retentionQuery.data]);

  const calcImpact = useCallback((newMinutes: number) => {
    const avg = avgQuery.data ?? 30;
    const raw = metricsQuery.data;
    if (!plan || !raw) return null;

    const totalPending = (Number(raw.total_new) || 0) + (Number(raw.total_review) || 0) + (Number(raw.total_learning) || 0);
    const newCardsPerDay = Math.floor((newMinutes * 60) / avg);

    if (plan.target_date) {
      const target = new Date(plan.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentDaysRemaining = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000));
      const newDaysNeeded = newCardsPerDay > 0 ? Math.ceil(totalPending / newCardsPerDay) : 9999;
      const diff = newDaysNeeded - currentDaysRemaining;
      return { cardsPerDay: newCardsPerDay, daysDiff: diff, daysNeeded: newDaysNeeded };
    }
    return { cardsPerDay: newCardsPerDay, daysDiff: null, daysNeeded: null };
  }, [plan, avgQuery.data, metricsQuery.data]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['study-plans'] });
    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
    qc.invalidateQueries({ queryKey: ['plan-health'] });
    qc.invalidateQueries({ queryKey: ['plan-retention'] });
    qc.invalidateQueries({ queryKey: ['selected-plan-id'] });
  }, [qc]);

  const createPlan = useMutation({
    mutationFn: async (input: { name: string; daily_minutes: number; deck_ids: string[]; target_date: string | null; weekly_minutes?: WeeklyMinutes | null }) => {
      const { data, error } = await supabase.from('study_plans' as any).insert({
        user_id: userId,
        name: input.name,
        daily_minutes: input.daily_minutes,
        deck_ids: input.deck_ids,
        target_date: input.target_date,
        weekly_minutes: input.weekly_minutes ?? null,
      } as any).select('id').single();
      if (error) throw error;
      // Auto-select the newly created plan
      const newId = (data as any)?.id;
      if (newId) {
        await supabase.from('profiles').update({ selected_plan_id: newId } as any).eq('id', userId!);
      }
    },
    onSuccess: invalidate,
  });

  const updatePlan = useMutation({
    mutationFn: async (input: { id?: string; name?: string; daily_minutes?: number; deck_ids?: string[]; target_date?: string | null; weekly_minutes?: WeeklyMinutes | null }) => {
      const planId = input.id ?? plan?.id;
      if (!planId) throw new Error('No plan to update');
      const { id: _id, ...rest } = input;
      const { error } = await supabase
        .from('study_plans' as any)
        .update(rest as any)
        .eq('id', planId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deletePlan = useMutation({
    mutationFn: async (planId?: string) => {
      const id = planId ?? plan?.id;
      if (!id) throw new Error('No plan to delete');
      // Clear selection if deleting the selected plan
      if (id === plan?.id) {
        await supabase.from('profiles').update({ selected_plan_id: null } as any).eq('id', userId!);
      }
      const { error } = await supabase.from('study_plans' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    plans,
    plan,
    isLoading: plansQuery.isLoading || selectedIdQuery.isLoading,
    metrics: computed,
    avgSecondsPerCard: avgQuery.data ?? 30,
    calcImpact,
    createPlan,
    updatePlan,
    deletePlan,
    selectPlan,
  };
}
