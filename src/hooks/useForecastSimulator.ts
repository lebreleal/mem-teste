import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ForecastView, ForecastParams, SimulatorInput, SimulatorResult, WorkerMessage, WorkerResponse } from '@/types/forecast';
import type { WeeklyMinutes } from '@/hooks/useStudyPlan';

export interface UseForecastSimulatorOptions {
  deckIds: string[];
  horizonDays: number;
  newCardsPerDayOverride?: number;
  createdCardsPerDayOverride?: number;
  dailyMinutes: number;
  weeklyMinutes: WeeklyMinutes | null;
  enabled?: boolean;
}

export function useForecastSimulator(options: UseForecastSimulatorOptions) {
  const { user } = useAuth();
  const userId = user?.id;
  const { deckIds, horizonDays, newCardsPerDayOverride, createdCardsPerDayOverride, dailyMinutes, weeklyMinutes, enabled = true } = options;

  const [result, setResult] = useState<SimulatorResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch forecast params from RPC
  const paramsQuery = useQuery({
    queryKey: ['forecast-params', userId, deckIds],
    queryFn: async () => {
      if (!userId || deckIds.length === 0) return null;
      const { data, error } = await supabase.rpc('get_forecast_params' as any, {
        p_user_id: userId,
        p_deck_ids: deckIds,
      });
      if (error) throw error;
      return data as unknown as ForecastParams;
    },
    enabled: !!userId && deckIds.length > 0 && enabled,
    staleTime: 5 * 60_000,
  });

  const defaultNewCardsPerDay = useMemo(() => {
    const decks = paramsQuery.data?.decks;
    if (!decks || decks.length === 0) return 20;
    return decks.reduce((sum, d) => sum + (d.daily_new_limit ?? 20), 0);
  }, [paramsQuery.data?.decks]);
  const newCardsPerDay = newCardsPerDayOverride ?? defaultNewCardsPerDay;

  const defaultCreatedCardsPerDay = paramsQuery.data?.avg_new_cards_per_day ?? 0;
  const createdCardsPerDay = createdCardsPerDayOverride ?? defaultCreatedCardsPerDay;

  // Create / terminate worker
  useEffect(() => {
    const w = new Worker(
      new URL('../workers/forecastWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = w;

    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'progress') {
        setProgress(e.data.progress ?? 0);
      } else if (e.data.type === 'result') {
        setResult(e.data.result ?? null);
        setIsSimulating(false);
        setProgress(100);
      } else if (e.data.type === 'error') {
        console.error('Forecast worker error:', e.data.error);
        setIsSimulating(false);
      }
    };

    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  // Run simulation when params change
  const runSimulation = useCallback(() => {
    const params = paramsQuery.data;
    if (!params || !workerRef.current) return;

    // Cancel previous
    workerRef.current.postMessage({ type: 'cancel' } as WorkerMessage);

    const input: SimulatorInput = {
      params,
      horizonDays,
      newCardsPerDay,
      createdCardsPerDay,
      dailyMinutes,
      weeklyMinutes: weeklyMinutes as Record<string, number> | null,
    };

    setIsSimulating(true);
    setProgress(0);
    workerRef.current.postMessage({ type: 'run', input } as WorkerMessage);
  }, [paramsQuery.data, horizonDays, newCardsPerDay, createdCardsPerDay, dailyMinutes, weeklyMinutes]);

  // Debounced trigger
  useEffect(() => {
    if (!paramsQuery.data || !enabled) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSimulation, 300);
    return () => clearTimeout(debounceRef.current);
  }, [runSimulation, enabled]);

  return {
    data: result?.points ?? [],
    summary: result?.summary ?? null,
    isSimulating,
    progress,
    defaultNewCardsPerDay,
    defaultCreatedCardsPerDay,
    isLoading: paramsQuery.isLoading,
    isUsingDefaults: (paramsQuery.data?.total_reviews_90d ?? 0) < 50,
  };
}

// ─── Forecast view persistence ──────────────────────────

export function useForecastView() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['forecast-view', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('forecast_view')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return ((data as any)?.forecast_view as ForecastView) ?? '7d';
    },
    enabled: !!userId,
    staleTime: Infinity,
  });

  const setView = useCallback(async (view: ForecastView) => {
    if (!userId) return;
    // Update cache immediately so UI responds instantly
    queryClient.setQueryData(['forecast-view', userId], view);
    await supabase
      .from('profiles')
      .update({ forecast_view: view } as any)
      .eq('id', userId);
  }, [userId, queryClient]);

  return { forecastView: query.data ?? '7d', setForecastView: setView };
}
