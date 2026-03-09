import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CardCounts {
  total: number;
  new: number;
  learning: number;
  review: number;
  relearning: number;
  young: number;
  mature: number;
  frozen: number;
}

export interface TrueRetention {
  correct: number;
  total: number;
  rate: number;
}

export interface ButtonCounts {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

export interface MonthSummary {
  days_studied: number;
  days_in_month: number;
  total_reviews: number;
  avg_reviews_per_day: number;
}

export interface CardStatistics {
  cardCounts: CardCounts;
  intervalDistribution: number[];
  stabilityDistribution: number[];
  difficultyDistribution: number[];
  retrievabilityDistribution: number[];
  trueRetention: TrueRetention;
  youngRetention: TrueRetention;
  matureRetention: TrueRetention;
  buttonCounts: ButtonCounts;
  monthSummary: MonthSummary;
}

const defaults: CardStatistics = {
  cardCounts: { total: 0, new: 0, learning: 0, review: 0, relearning: 0, young: 0, mature: 0, frozen: 0 },
  intervalDistribution: [],
  stabilityDistribution: [],
  difficultyDistribution: [],
  retrievabilityDistribution: [],
  trueRetention: { correct: 0, total: 0, rate: 0 },
  youngRetention: { correct: 0, total: 0, rate: 0 },
  matureRetention: { correct: 0, total: 0, rate: 0 },
  buttonCounts: { again: 0, hard: 0, good: 0, easy: 0, total: 0 },
  monthSummary: { days_studied: 0, days_in_month: 30, total_reviews: 0, avg_reviews_per_day: 0 },
};

function parseRetention(obj: any): TrueRetention {
  return {
    correct: Number(obj?.correct ?? 0),
    total: Number(obj?.total ?? 0),
    rate: Number(obj?.rate ?? 0),
  };
}

export function useCardStatistics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['card-statistics', user?.id],
    queryFn: async (): Promise<CardStatistics> => {
      if (!user) return defaults;
      const { data, error } = await supabase.rpc('get_card_statistics' as any, { p_user_id: user.id });
      if (error) {
        console.warn('[useCardStatistics] RPC error, using defaults:', error.message);
        return defaults;
      }
      const r = data as any;
      if (!r) return defaults;

      return {
        cardCounts: {
          total: Number(r.card_counts?.total ?? 0),
          new: Number(r.card_counts?.new ?? 0),
          learning: Number(r.card_counts?.learning ?? 0),
          review: Number(r.card_counts?.review ?? 0),
          relearning: Number(r.card_counts?.relearning ?? 0),
          young: Number(r.card_counts?.young ?? 0),
          mature: Number(r.card_counts?.mature ?? 0),
          frozen: Number(r.card_counts?.frozen ?? 0),
        },
        intervalDistribution: (r.interval_distribution ?? []).map(Number),
        stabilityDistribution: (r.stability_distribution ?? []).map(Number),
        difficultyDistribution: (r.difficulty_distribution ?? []).map(Number),
        retrievabilityDistribution: (r.retrievability_distribution ?? []).map(Number),
        trueRetention: parseRetention(r.true_retention),
        youngRetention: parseRetention(r.young_retention),
        matureRetention: parseRetention(r.mature_retention),
        buttonCounts: {
          again: Number(r.button_counts?.again ?? 0),
          hard: Number(r.button_counts?.hard ?? 0),
          good: Number(r.button_counts?.good ?? 0),
          easy: Number(r.button_counts?.easy ?? 0),
          total: Number(r.button_counts?.total ?? 0),
        },
        monthSummary: {
          days_studied: Number(r.month_summary?.days_studied ?? 0),
          days_in_month: Number(r.month_summary?.days_in_month ?? 30),
          total_reviews: Number(r.month_summary?.total_reviews ?? 0),
          avg_reviews_per_day: Number(r.month_summary?.avg_reviews_per_day ?? 0),
        },
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
