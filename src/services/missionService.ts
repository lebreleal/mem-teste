/**
 * Service layer for missions (daily/weekly/achievement).
 */

import { supabase } from '@/integrations/supabase/client';
import { getWeekStart, getToday } from '@/lib/dateUtils';
import type { MissionDefinition, UserMission, MissionWithProgress } from '@/types/missions';

interface MissionStats {
  todayMinutes: number;
  streak: number;
}

/** Fetch all missions with progress for the current user. */
export async function fetchMissions(userId: string, stats: MissionStats): Promise<MissionWithProgress[]> {
  const { data: definitions } = await supabase
    .from('mission_definitions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (!definitions) return [];

  const today = getToday();
  const weekStart = getWeekStart();

  const { data: userMissions } = await supabase
    .from('user_missions')
    .select('*')
    .eq('user_id', userId);

  const userMissionMap = new Map<string, UserMission>();
  (userMissions ?? []).forEach((um: any) => {
    const def = definitions.find((d: any) => d.id === um.mission_id);
    if (!def) return;
    if (def.category === 'daily' && um.period_start === today) {
      userMissionMap.set(um.mission_id, um);
    } else if (def.category === 'weekly' && um.period_start === weekStart) {
      userMissionMap.set(um.mission_id, um);
    } else if (def.category === 'achievement') {
      userMissionMap.set(um.mission_id, um);
    }
  });

  const { data: profile } = await supabase
    .from('profiles')
    .select('daily_cards_studied, successful_cards_counter')
    .eq('id', userId)
    .single();

  const dailyCards = profile?.daily_cards_studied ?? 0;
  const totalCards = profile?.successful_cards_counter ?? 0;

  const { count: deckCount } = await supabase
    .from('decks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const weekStartDate = weekStart + 'T00:00:00.000Z';
  const { count: weeklyCards } = await supabase
    .from('review_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('reviewed_at', weekStartDate);

  return (definitions as MissionDefinition[]).map(def => {
    const um = userMissionMap.get(def.id);
    let currentProgress = 0;

    switch (def.target_type) {
      case 'cards_studied': currentProgress = dailyCards; break;
      case 'minutes_studied': currentProgress = stats.todayMinutes; break;
      case 'streak': currentProgress = stats.streak; break;
      case 'cards_studied_week': currentProgress = weeklyCards ?? 0; break;
      case 'total_cards_studied': currentProgress = totalCards; break;
      case 'decks_created': currentProgress = deckCount ?? 0; break;
      case 'max_streak': currentProgress = stats.streak; break;
    }

    const isCompleted = um?.is_completed || currentProgress >= def.target_value;
    const isClaimed = um?.is_claimed ?? false;

    return {
      ...def,
      userMission: um,
      currentProgress: Math.min(currentProgress, def.target_value),
      isCompleted,
      isClaimed,
    };
  });
}

/** Claim a mission reward. */
export async function claimMissionReward(userId: string, mission: MissionWithProgress) {
  const today = getToday();
  const weekStart = getWeekStart();
  const periodStart = mission.category === 'daily' ? today : mission.category === 'weekly' ? weekStart : today;

  const { error: umError } = await supabase
    .from('user_missions')
    .upsert({
      user_id: userId,
      mission_id: mission.id,
      progress: mission.currentProgress,
      is_completed: true,
      is_claimed: true,
      period_start: periodStart,
      completed_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,mission_id,period_start' });

  if (umError) throw umError;

  // Use deduct_energy with negative cost to add credits atomically
  const { data: remaining, error: creditError } = await supabase
    .rpc('deduct_energy', { p_user_id: userId, p_cost: -mission.reward_credits });

  if (creditError) throw creditError;

  return mission;
}
