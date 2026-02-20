import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMemo } from 'react';

export interface StudyPlan {
  id: string;
  user_id: string;
  daily_minutes: number;
  deck_ids: string[];
  target_date: string | null;
  created_at: string;
  updated_at: string;
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
}

export function useStudyPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const planQuery = useQuery({
    queryKey: ['study-plan', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plans' as any)
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StudyPlan) ?? null;
    },
    enabled: !!userId,
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
    queryKey: ['plan-metrics', userId, planQuery.data?.deck_ids],
    queryFn: async () => {
      const deckIds = planQuery.data?.deck_ids ?? [];
      if (deckIds.length === 0) return { total_new: 0, total_review: 0, total_learning: 0 };
      const { data, error } = await supabase.rpc('get_plan_metrics' as any, {
        p_user_id: userId,
        p_deck_ids: deckIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? { total_new: 0, total_review: 0, total_learning: 0 };
    },
    enabled: !!userId && !!planQuery.data,
  });

  // Fetch retention from decks in plan
  const retentionQuery = useQuery({
    queryKey: ['plan-retention', planQuery.data?.deck_ids],
    queryFn: async () => {
      const deckIds = planQuery.data?.deck_ids ?? [];
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
    enabled: !!planQuery.data && (planQuery.data?.deck_ids?.length ?? 0) > 0,
    staleTime: 5 * 60_000,
  });

  // Plan health: count distinct study days since plan creation
  const planHealthQuery = useQuery({
    queryKey: ['plan-health', userId, planQuery.data?.created_at],
    queryFn: async () => {
      const plan = planQuery.data;
      if (!plan) return null;
      const { data, error } = await supabase
        .from('review_logs')
        .select('reviewed_at')
        .eq('user_id', userId!)
        .gte('reviewed_at', plan.created_at);
      if (error) throw error;
      // Count distinct days
      const days = new Set<string>();
      (data ?? []).forEach((r: any) => {
        days.add(new Date(r.reviewed_at).toISOString().slice(0, 10));
      });
      const totalDays = Math.max(1, Math.ceil((Date.now() - new Date(plan.created_at).getTime()) / 86400000));
      return Math.min(100, Math.round((days.size / totalDays) * 100));
    },
    enabled: !!userId && !!planQuery.data,
    staleTime: 5 * 60_000,
  });

  const computed = useMemo<PlanMetrics | null>(() => {
    const plan = planQuery.data;
    const avg = avgQuery.data;
    const raw = metricsQuery.data;
    if (!plan || avg == null || !raw) return null;

    const totalNew = Number(raw.total_new) || 0;
    const totalReview = Number(raw.total_review) || 0;
    const totalLearning = Number(raw.total_learning) || 0;
    const avgSec = avg;
    const cardsPerDay = Math.floor((plan.daily_minutes * 60) / avgSec);
    const cardsPerWeek = cardsPerDay * 7;

    // Estimate minutes today
    const reviewMinutes = Math.round((totalReview * avgSec) / 60);
    const dailyNewCards = Math.max(0, cardsPerDay - totalReview);
    const newMinutes = Math.round((Math.min(dailyNewCards, totalNew) * avgSec) / 60);
    const estimatedMinutesToday = reviewMinutes + newMinutes;

    let requiredCardsPerDay: number | null = null;
    let daysRemaining: number | null = null;
    let coveragePercent: number | null = null;
    let healthStatus: 'green' | 'yellow' | 'orange' | 'red' = 'green';

    if (plan.target_date) {
      const target = new Date(plan.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysRemaining = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000));
      const totalPending = totalNew + totalReview + totalLearning;
      requiredCardsPerDay = Math.ceil(totalPending / daysRemaining);
      coveragePercent = requiredCardsPerDay > 0 ? Math.min(100, Math.round((cardsPerDay / requiredCardsPerDay) * 100)) : 100;

      // 4-color system
      if (coveragePercent >= 100) healthStatus = 'green';
      else if (coveragePercent >= 70) healthStatus = 'yellow';
      else if (coveragePercent >= 50) healthStatus = 'orange';
      else healthStatus = 'red';
    } else {
      // Without target date, use load-based 4-color
      if (estimatedMinutesToday <= plan.daily_minutes * 0.7) healthStatus = 'green';
      else if (estimatedMinutesToday <= plan.daily_minutes) healthStatus = 'yellow';
      else if (estimatedMinutesToday <= plan.daily_minutes * 1.5) healthStatus = 'orange';
      else healthStatus = 'red';
    }

    return {
      totalNew,
      totalReview,
      totalLearning,
      avgSecondsPerCard: avgSec,
      cardsPerDay,
      cardsPerWeek,
      requiredCardsPerDay,
      daysRemaining,
      coveragePercent,
      healthStatus,
      estimatedMinutesToday,
      reviewMinutes,
      newMinutes,
      planHealthPercent: planHealthQuery.data ?? null,
      avgRetention: retentionQuery.data ?? 0.9,
    };
  }, [planQuery.data, avgQuery.data, metricsQuery.data, planHealthQuery.data, retentionQuery.data]);

  /** Calculate impact of changing daily minutes */
  const calcImpact = (newMinutes: number) => {
    const plan = planQuery.data;
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
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['study-plan'] });
    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
    qc.invalidateQueries({ queryKey: ['plan-health'] });
    qc.invalidateQueries({ queryKey: ['plan-retention'] });
  };

  const createPlan = useMutation({
    mutationFn: async (input: { daily_minutes: number; deck_ids: string[]; target_date: string | null }) => {
      const { error } = await supabase.from('study_plans' as any).insert({
        user_id: userId,
        daily_minutes: input.daily_minutes,
        deck_ids: input.deck_ids,
        target_date: input.target_date,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updatePlan = useMutation({
    mutationFn: async (input: { daily_minutes?: number; deck_ids?: string[]; target_date?: string | null }) => {
      const { error } = await supabase
        .from('study_plans' as any)
        .update(input as any)
        .eq('user_id', userId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deletePlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('study_plans' as any).delete().eq('user_id', userId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    plan: planQuery.data ?? null,
    isLoading: planQuery.isLoading,
    metrics: computed,
    avgSecondsPerCard: avgQuery.data ?? 30,
    calcImpact,
    createPlan,
    updatePlan,
    deletePlan,
  };
}
