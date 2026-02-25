import { useState } from 'react';
import { useForecastSimulator, useForecastView } from '@/hooks/useForecastSimulator';
import { ForecastSimulator } from '@/components/study-plan/PlanComponents';
import type { WeeklyMinutes, WeeklyNewCards } from '@/hooks/useStudyPlan';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { collectDescendantIds } from '@/lib/studyUtils';
import { useDecks } from '@/hooks/useDecks';

interface DeckStatsTabProps {
  deckId: string;
}

export function DeckStatsTab({ deckId }: DeckStatsTabProps) {
  const { user } = useAuth();
  const { decks } = useDecks();
  const { forecastView, setForecastView } = useForecastView();

  // Collect this deck + all descendant IDs
  const allDeckIds = [deckId, ...collectDescendantIds(decks, deckId)];

  // Fetch profile daily_minutes + weekly_minutes for capacity
  const profileQuery = useQuery({
    queryKey: ['profile-capacity', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('daily_study_minutes, weekly_study_minutes, daily_new_cards_limit, weekly_new_cards')
        .eq('id', user!.id)
        .single();
      return data as any;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const realDailyMinutes = profileQuery.data?.daily_study_minutes ?? 60;
  const realWeeklyMinutes = profileQuery.data?.weekly_study_minutes as WeeklyMinutes | null ?? null;
  const realWeeklyNewCards = profileQuery.data?.weekly_new_cards as WeeklyNewCards | null ?? null;

  // Simulation overrides (local state)
  const [newCardsOverride, setNewCardsOverride] = useState<number | undefined>();
  const [createdCardsOverride, setCreatedCardsOverride] = useState<number | undefined>();
  const [dailyMinutesOverride, setDailyMinutesOverride] = useState<number | undefined>();
  const [weeklyMinutesOverride, setWeeklyMinutesOverride] = useState<WeeklyMinutes | undefined>();
  const [weeklyNewCardsOverride, setWeeklyNewCardsOverride] = useState<WeeklyNewCards | undefined>();
  const [customTargetDate, setCustomTargetDate] = useState<Date | null>(null);

  // Compute horizon from forecastView
  const horizonDays = forecastView === '7d' ? 7
    : forecastView === '30d' ? 30
    : forecastView === '90d' ? 90
    : forecastView === '365d' ? 365
    : customTargetDate ? Math.max(7, Math.ceil((customTargetDate.getTime() - Date.now()) / 86400000))
    : 30;

  const effectiveDailyMinutes = dailyMinutesOverride ?? realDailyMinutes;

  const sim = useForecastSimulator({
    deckIds: allDeckIds,
    horizonDays,
    newCardsPerDayOverride: newCardsOverride,
    createdCardsPerDayOverride: createdCardsOverride,
    dailyMinutes: effectiveDailyMinutes,
    weeklyMinutes: weeklyMinutesOverride ?? realWeeklyMinutes,
    weeklyNewCards: weeklyNewCardsOverride ?? realWeeklyNewCards,
    enabled: true,
  });

  const hasAnyOverride = newCardsOverride !== undefined || createdCardsOverride !== undefined
    || dailyMinutesOverride !== undefined || weeklyMinutesOverride !== undefined
    || weeklyNewCardsOverride !== undefined;

  if (sim.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ForecastSimulator
      data={sim.data}
      summary={sim.summary}
      isSimulating={sim.isSimulating}
      progress={sim.progress}
      defaultNewCardsPerDay={sim.defaultNewCardsPerDay}
      forecastView={forecastView}
      onViewChange={setForecastView}
      newCardsOverride={newCardsOverride}
      onNewCardsChange={setNewCardsOverride}
      hasTargetDate={!!customTargetDate}
      customTargetDate={customTargetDate}
      onCustomTargetDate={setCustomTargetDate}
      isUsingDefaults={sim.isUsingDefaults}
      totalNewCards={sim.totalNewCards}
      defaultCreatedCardsPerDay={sim.defaultCreatedCardsPerDay}
      createdCardsOverride={createdCardsOverride}
      onCreatedCardsChange={setCreatedCardsOverride}
      realDailyMinutes={realDailyMinutes}
      realWeeklyMinutes={realWeeklyMinutes}
      dailyMinutesOverride={dailyMinutesOverride}
      weeklyMinutesOverride={weeklyMinutesOverride}
      onDailyMinutesChange={setDailyMinutesOverride}
      onWeeklyMinutesChange={setWeeklyMinutesOverride}
      onApplyCapacity={() => {}}
      hasAnyOverride={hasAnyOverride}
      realWeeklyNewCards={realWeeklyNewCards}
      weeklyNewCardsOverride={weeklyNewCardsOverride}
      onWeeklyNewCardsChange={setWeeklyNewCardsOverride}
    />
  );
}
