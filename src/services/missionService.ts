/**
 * Service layer for missions (daily/weekly/achievement).
 */

import { supabase } from '@/integrations/supabase/client';
import { getWeekStart, getToday } from '@/lib/dateUtils';
import type { MissionDefinition, UserMission, MissionWithProgress } from '@/types/missions';

interface MissionStats {
  todayMinutes: number;
  streak: number;
  /** Pre-cached values to avoid redundant queries */
  cachedDailyCards?: number;
  cachedTotalCards?: number;
  cachedDeckCount?: number;
}

/** Fetch all missions with progress for the current user. */
export async function fetchMissions(userId: string, stats: MissionStats): Promise<MissionWithProgress[]> {
  const today = getToday();
  const weekStart = getWeekStart();

  // Phase 1: fetch definitions + userMissions in parallel (independent)
  const [{ data: definitions }, { data: userMissions }] = await Promise.all([
    supabase
      .from('mission_definitions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('user_missions')
      .select('*')
      .eq('user_id', userId),
  ]);

  if (!definitions) return [];

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

  // Phase 2: fetch data in parallel, skipping queries when cached values are provided
  const weekStartDate = weekStart + 'T00:00:00.000Z';
  const needsProfile = stats.cachedDailyCards == null || stats.cachedTotalCards == null;
  const needsDeckCount = stats.cachedDeckCount == null;

  const [profileResult, deckCountResult, { count: weeklyCards }, { count: totalSuggestions }, { count: acceptedSuggestions }] = await Promise.all([
    needsProfile
      ? supabase.from('profiles').select('daily_cards_studied, successful_cards_counter').eq('id', userId).single()
      : Promise.resolve({ data: null }),
    needsDeckCount
      ? supabase.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      : Promise.resolve({ count: stats.cachedDeckCount }),
    supabase
      .from('review_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('reviewed_at', weekStartDate),
    supabase
      .from('deck_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('suggester_user_id', userId),
    supabase
      .from('deck_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('suggester_user_id', userId)
      .eq('status', 'accepted'),
  ]);

  const profile = needsProfile ? profileResult.data : null;
  const deckCount = needsDeckCount ? (deckCountResult as any).count : stats.cachedDeckCount;

  const dailyCards = stats.cachedDailyCards ?? profile?.daily_cards_studied ?? 0;
  const totalCards = stats.cachedTotalCards ?? profile?.successful_cards_counter ?? 0;

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
      case 'suggestions_made': currentProgress = totalSuggestions ?? 0; break;
      case 'suggestions_accepted': currentProgress = acceptedSuggestions ?? 0; break;
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

/** Fetch XP leaderboard. XP = (reviews * 1) + (accepted suggestions * 50). */
export async function fetchXPLeaderboard(): Promise<{ user_id: string; user_name: string; xp: number; reviews: number; contributions: number }[]> {
  // Get top users by review count (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: logs } = await supabase
    .from('review_logs')
    .select('user_id')
    .gte('reviewed_at', thirtyDaysAgo.toISOString());

  if (!logs || logs.length === 0) return [];

  // Count reviews per user
  const reviewMap = new Map<string, number>();
  logs.forEach((l: any) => reviewMap.set(l.user_id, (reviewMap.get(l.user_id) ?? 0) + 1));

  // Get accepted suggestions per user
  const userIds = [...reviewMap.keys()];
  const { data: suggestions } = await supabase
    .from('deck_suggestions')
    .select('suggester_user_id')
    .eq('status', 'accepted')
    .in('suggester_user_id', userIds);

  const contribMap = new Map<string, number>();
  (suggestions ?? []).forEach((s: any) => contribMap.set(s.suggester_user_id, (contribMap.get(s.suggester_user_id) ?? 0) + 1));

  // Calculate XP and sort
  const entries = userIds.map(uid => ({
    user_id: uid,
    reviews: reviewMap.get(uid) ?? 0,
    contributions: contribMap.get(uid) ?? 0,
    xp: (reviewMap.get(uid) ?? 0) + (contribMap.get(uid) ?? 0) * 50,
  }));
  entries.sort((a, b) => b.xp - a.xp);
  const top = entries.slice(0, 50);

  // Get names
  const topIds = top.map(e => e.user_id);
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: topIds });
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  return top.map(e => ({ ...e, user_name: nameMap.get(e.user_id) ?? 'Anônimo' }));
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
