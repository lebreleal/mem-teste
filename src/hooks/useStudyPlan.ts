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
  healthStatus: 'green' | 'yellow' | 'red';
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

    let requiredCardsPerDay: number | null = null;
    let daysRemaining: number | null = null;
    let coveragePercent: number | null = null;
    let healthStatus: 'green' | 'yellow' | 'red' = 'green';

    if (plan.target_date) {
      const target = new Date(plan.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysRemaining = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000));
      const totalPending = totalNew + totalReview + totalLearning;
      requiredCardsPerDay = Math.ceil(totalPending / daysRemaining);
      coveragePercent = requiredCardsPerDay > 0 ? Math.min(100, Math.round((cardsPerDay / requiredCardsPerDay) * 100)) : 100;
      if (coveragePercent >= 100) healthStatus = 'green';
      else if (coveragePercent >= 70) healthStatus = 'yellow';
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
    };
  }, [planQuery.data, avgQuery.data, metricsQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['study-plan'] });
    qc.invalidateQueries({ queryKey: ['plan-metrics'] });
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
    createPlan,
    updatePlan,
    deletePlan,
  };
}
