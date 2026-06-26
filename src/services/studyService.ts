/**
 * Service layer for study sessions and study statistics.
 * Abstracts all Supabase queries for study-related data.
 *
 * Performance: fetchStudyQueue uses 3 sequential query rounds (down from 4):
 *   Round 1: allDecks + allFolders (parallel)
 *   Round 2: cards + allCardIds + plans + profile (parallel)
 *   Round 3: hierarchyLimits + globalLimits (parallel)
 */

import { supabase } from '@/integrations/supabase/client';
// Error deck imports removed — cards no longer move to error deck on fail
import { fsrsSchedule, type Rating, type FSRSCard, type FSRSParams, type FSRSOutput, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { sm2Schedule, type SM2Card, type SM2Params, type SM2Output } from '@/lib/sm2';
import { parseStepToMinutes } from '@/lib/studyUtils';
import { TZ_OFFSET_SP } from '@/lib/dateUtils';

export type { StudyQueueResult, StudyCard, DeckStudyConfig, CardReviewResult, StudyQueueLimitsRow, StudyPlanRow, StudyProfileRow, CardUpdatePayload, StudyStatsSummaryRow, ActivityBreakdownResult, ActivityDayRow, HourlyBreakdownRow, RetentionRow, CardsAddedRow } from '@/types/study';
import type { StudyQueueResult, StudyCard, DeckStudyConfig, CardReviewResult, StudyQueueLimitsRow, StudyPlanRow, StudyProfileRow, CardUpdatePayload, StudyStatsSummaryRow, ActivityBreakdownResult, HourlyBreakdownRow, RetentionRow, CardsAddedRow } from '@/types/study';

interface BuildStudyQueueResult {
  cards: StudyCard[];
  algorithmMode: string;
  deckConfig: DeckStudyConfig | null;
  isLiveDeck: boolean;
  scopeDeckCount: number;
}

/**
 * Fetch the study queue for a deck, folder, or "study all" via a single
 * server-side RPC (build_study_queue). Scope, daily limits, sibling burial
 * and deck config are all resolved in one round-trip on the database.
 */
export async function fetchStudyQueue(
  userId: string,
  deckId: string,
  folderId?: string,
): Promise<StudyQueueResult> {
  const scope = folderId ? 'folder' : (deckId ? 'deck' : 'all');
  const tzOffsetMinutes = TZ_OFFSET_SP;

  const callRpc = () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not yet in generated types
    (supabase.rpc as any)('build_study_queue', {
      p_user_id: userId,
      p_scope: scope,
      p_deck_id: deckId || null,
      p_folder_id: folderId || null,
      p_tz_offset_minutes: tzOffsetMinutes,
    }) as Promise<{ data: unknown; error: { message: string } | null }>;

  const first = await callRpc();
  if (first.error) throw first.error;
  let result = first.data as BuildStudyQueueResult | null;

  // Follower-room safety: a turma/community folder with no local decks yet →
  // bootstrap the mirror decks on demand, then retry the queue once.
  if (scope === 'folder' && folderId && (result?.scopeDeckCount ?? 0) === 0) {
    const { data: folderMeta } = await supabase
      .from('folders')
      .select('source_turma_id')
      .eq('id', folderId)
      .eq('user_id', userId)
      .maybeSingle();

    if (folderMeta?.source_turma_id) {
      await supabase.rpc('bootstrap_follower_decks', {
        p_user_id: userId,
        p_turma_id: folderMeta.source_turma_id,
        p_folder_id: folderId,
      });
      const retry = await callRpc();
      if (retry.error) throw retry.error;
      result = retry.data as BuildStudyQueueResult | null;
    }
  }

  if (!result) {
    return { cards: [], algorithmMode: 'fsrs', deckConfig: undefined, isLiveDeck: false };
  }

  return {
    cards: (result.cards ?? []) as StudyCard[],
    algorithmMode: result.algorithmMode || 'fsrs',
    deckConfig: (result.deckConfig ?? undefined) as DeckStudyConfig | undefined,
    isLiveDeck: result.isLiveDeck ?? false,
  };
}

/** Resolve community deck source info via RPC. */
export async function resolveCommunitySource(deckId: string) {
  const { data } = await supabase.rpc('resolve_community_deck_source', { p_deck_id: deckId });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  return { authorName: (obj.authorName as string) ?? null, updatedAt: (obj.updatedAt as string) ?? null };
}

/** Fetch recent fail streak for leech detection. */
export async function fetchLeechStreak(userId: string, cardId: string, limit: number): Promise<number> {
  const { data, error } = await supabase
    .from('review_logs')
    .select('rating')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .order('reviewed_at', { ascending: false })
    .limit(limit);
  if (error || !data?.length) return 0;
  let streak = 0;
  for (const row of data) {
    if (row.rating === 1) streak += 1;
    else break;
  }
  return streak;
}




/** Submit a card review and update scheduling. */
export async function submitCardReview(
  userId: string,
  card: StudyCard,
  rating: Rating,
  algorithmMode: string,
  deckConfig: DeckStudyConfig | undefined,
  elapsedMs?: number,
): Promise<CardReviewResult> {
  const cappedMs = elapsedMs
    ? Math.min(Math.max(elapsedMs, 1500), 120000)
    : null;

  if (algorithmMode === 'quick_review') {
    const nowIso = new Date().toISOString();
    const newState = rating > 2 ? 2 : 1;
    const isRatingFail = rating === 1;
    const isInErrorDeck = !!card.origin_deck_id;

    const updatePayload: Pick<CardUpdatePayload, 'state' | 'last_reviewed_at' | 'last_rating'> = {
      state: newState,
      last_reviewed_at: nowIso,
      last_rating: rating,
    };

    const [updateResult, logResult] = await Promise.all([
      supabase.from('cards').update(updatePayload).eq('id', card.id),
      supabase.from('review_logs').insert({
        user_id: userId,
        card_id: card.id,
        rating,
        stability: 0,
        difficulty: 0,
        scheduled_date: nowIso,
        elapsed_ms: cappedMs,
      }),
    ]);

    if (updateResult.error) throw updateResult.error;
    if (logResult.error) throw logResult.error;

    return {
      state: newState,
      stability: 0,
      difficulty: 0,
      scheduled_date: nowIso,
      interval_days: 1,
      movedToError: false,
      returnedFromError: false,
      originDeckName: null,
    };
  }

  const learningStepsRaw: string[] = deckConfig?.learning_steps || ['1m', '10m'];
  const learningStepsMinutes = learningStepsRaw.map(parseStepToMinutes);
  const maxIntervalDays = deckConfig?.max_interval ?? 36500;

  let result: FSRSOutput | SM2Output;

  if (algorithmMode === 'fsrs') {
    const requestedRetention = deckConfig?.requested_retention ?? 0.85;
    const easyGraduatingInterval = deckConfig?.easy_graduating_interval ?? 15;
    const params: FSRSParams = {
      ...DEFAULT_FSRS_PARAMS,
      requestedRetention,
      maximumInterval: maxIntervalDays,
      learningSteps: learningStepsMinutes,
      relearningSteps: [learningStepsMinutes[0] ?? 10],
      easyGraduatingInterval,
    };
    const fsrsCard: FSRSCard = {
      stability: card.stability, difficulty: card.difficulty, state: card.state,
      scheduled_date: card.scheduled_date, learning_step: card.learning_step ?? 0,
      last_reviewed_at: card.last_reviewed_at ?? undefined,
    };
    result = fsrsSchedule(fsrsCard, rating, params);
  } else {
    const easyBonusPct = (deckConfig?.easy_bonus ?? 130) / 100;
    const intervalModPct = (deckConfig?.interval_modifier ?? 100) / 100;
    const sm2Params: SM2Params = {
      learningSteps: learningStepsMinutes, easyBonus: easyBonusPct,
      intervalModifier: intervalModPct, maxInterval: maxIntervalDays,
    };
    const sm2Card: SM2Card = {
      stability: card.stability, difficulty: card.difficulty,
      state: card.state, scheduled_date: card.scheduled_date,
    };
    result = sm2Schedule(sm2Card, rating, sm2Params);
  }

  // Build update payload
  const updatePayload: CardUpdatePayload = {
    stability: result.stability, difficulty: result.difficulty,
    state: result.state, scheduled_date: result.scheduled_date,
    last_reviewed_at: new Date().toISOString(), learning_step: 'learning_step' in result ? result.learning_step : 0,
    last_rating: rating,
  };

  const [updateResult, logResult] = await Promise.all([
    supabase.from('cards').update(updatePayload).eq('id', card.id),
    supabase.from('review_logs').insert({
      user_id: userId, card_id: card.id, rating,
      stability: result.stability, difficulty: result.difficulty,
      scheduled_date: result.scheduled_date, state: card.state, elapsed_ms: cappedMs,
    }),
  ]);
  if (updateResult.error) throw updateResult.error;
  if (logResult.error) throw logResult.error;

  return { ...result, movedToError: false, returnedFromError: false, originDeckName: null };
}

import type { StudyStats } from '@/types/study';
export type { StudyStats } from '@/types/study';

/** Fetch study statistics using server-side RPC (eliminates 1500+ row transfer). */
export async function fetchStudyStats(userId: string, _cachedProfile?: Record<string, unknown>): Promise<StudyStats> {
  const tzOffsetMinutes = TZ_OFFSET_SP;
  const { data, error } = await supabase.rpc('get_study_stats_summary', {
    p_user_id: userId, p_tz_offset_minutes: tzOffsetMinutes,
  });
  if (error) throw error;
  const result = data as unknown as StudyStatsSummaryRow | null;
  if (!result) {
    return {
      lastStudyDate: null, streak: 0, energy: 0, dailyEnergyEarned: 0,
      mascotState: 'sleeping', todayCards: 0, avgMinutesPerDay7d: 0,
      todayMinutes: 0, freezesAvailable: 0,
    };
  }
  return {
    lastStudyDate: result.last_study_date ? new Date(result.last_study_date) : null,
    streak: result.streak ?? 0, energy: result.energy ?? 0,
    dailyEnergyEarned: result.daily_energy_earned ?? 0,
    mascotState: result.mascot_state ?? 'sleeping',
    todayCards: result.today_cards ?? 0, avgMinutesPerDay7d: result.avg_minutes_7d ?? 0,
    todayMinutes: result.today_minutes ?? 0, freezesAvailable: result.freezes_available ?? 0,
  };
}

/** Fetch deck_ids from all study plans of a user. */
export async function fetchStudyPlanDeckIds(userId: string): Promise<Array<{ deck_ids: string[] | null }>> {
  const { data, error } = await supabase
    .from('study_plans')
    .select('deck_ids')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as Array<{ deck_ids: string[] | null }>;
}

/** Fetch daily activity breakdown (heatmap + streak). */
export async function fetchActivityBreakdown(userId: string, days = 365, tzOffsetMinutes = -180): Promise<ActivityBreakdownResult | null> {
  const { data, error } = await supabase.rpc('get_activity_daily_breakdown', {
    p_user_id: userId,
    p_tz_offset_minutes: tzOffsetMinutes,
    p_days: days,
  });
  if (error) throw error;
  return (data as unknown as ActivityBreakdownResult) ?? null;
}

/** Fetch hourly review breakdown. */
export async function fetchHourlyBreakdown(userId: string, days = 30, tzOffsetMinutes = -180): Promise<HourlyBreakdownRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
  const { data, error } = await (supabase.rpc as any)('get_hourly_breakdown', {
    p_user_id: userId,
    p_tz_offset_minutes: tzOffsetMinutes,
    p_days: days,
  });
  if (error) throw error;
  return (data as unknown as HourlyBreakdownRow[]) ?? [];
}

/** Fetch retention over time (weekly buckets). */
export async function fetchRetentionOverTime(userId: string, days = 180): Promise<RetentionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
  const { data, error } = await (supabase.rpc as any)('get_retention_over_time', {
    p_user_id: userId,
    p_days: days,
  });
  if (error) throw error;
  return (data as unknown as RetentionRow[]) ?? [];
}

/** Fetch cards added per day. */
export async function fetchCardsAddedPerDay(userId: string, days = 90): Promise<CardsAddedRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
  const { data, error } = await (supabase.rpc as any)('get_cards_added_per_day', {
    p_user_id: userId,
    p_days: days,
  });
  if (error) throw error;
  return (data as unknown as CardsAddedRow[]) ?? [];
}
