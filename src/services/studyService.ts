/**
 * Service layer for study sessions and study statistics.
 * Abstracts all Supabase queries for study-related data.
 */

import { supabase } from '@/integrations/supabase/client';
import { fsrsSchedule, type Rating, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { sm2Schedule, type SM2Card, type SM2Params } from '@/lib/sm2';
import { parseStepToMinutes, shuffleArray, collectDescendantIds, collectFolderDeckIds, findRootAncestorId } from '@/lib/studyUtils';
import { calculateStreak, getMascotState } from '@/lib/streakUtils';

export interface StudyQueueResult {
  cards: any[];
  algorithmMode: string;
  deckConfig: any;
  isLiveDeck: boolean;
}

/** Fetch the study queue for a deck or folder. */
export async function fetchStudyQueue(
  userId: string,
  deckId: string,
  folderId?: string,
): Promise<StudyQueueResult> {
  const { data: allDecks } = await supabase
    .from('decks')
    .select('id, parent_deck_id, folder_id, daily_new_limit, daily_review_limit, algorithm_mode, learning_steps, requested_retention, max_interval, interval_modifier, easy_bonus, shuffle_cards, is_live_deck, bury_siblings, bury_new_siblings, bury_review_siblings, bury_learning_siblings')
    .eq('user_id', userId);

  let deckIds: string[];
  let deckConfig: any;
  let limitScopeIds: string[];

  if (folderId) {
    const { data: allFolders } = await supabase
      .from('folders')
      .select('id, parent_id')
      .eq('user_id', userId);

    const rootDeckIds = collectFolderDeckIds(allDecks ?? [], allFolders ?? [], folderId);
    const allDescendants = rootDeckIds.flatMap(id => collectDescendantIds(allDecks ?? [], id));
    deckIds = [...new Set([...rootDeckIds, ...allDescendants])];
    const firstDeck = (allDecks ?? []).find(d => deckIds.includes(d.id));
    deckConfig = firstDeck ?? {};
    limitScopeIds = deckIds;
  } else {
    const descendantIds = collectDescendantIds(allDecks ?? [], deckId);
    deckIds = [deckId, ...descendantIds];

    // Root ancestor's config governs ALL descendants
    const rootId = findRootAncestorId(allDecks ?? [], deckId);
    deckConfig = (allDecks ?? []).find(d => d.id === rootId) ?? {};

    // Count limits across the ENTIRE root hierarchy
    const rootDescendants = collectDescendantIds(allDecks ?? [], rootId);
    limitScopeIds = [rootId, ...rootDescendants];
  }

  const deckNewLimit = deckConfig?.daily_new_limit ?? 20;
  const reviewLimit = deckConfig?.daily_review_limit ?? 100;
  const algorithmMode = deckConfig?.algorithm_mode || 'fsrs';
  const shuffle = deckConfig?.shuffle_cards ?? false;

  if (algorithmMode === 'quick_review') {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const cards = data ?? [];
    const isLiveDeck = deckIds.some(id => (allDecks ?? []).find(d => d.id === id)?.is_live_deck);
    return { cards: shuffle ? shuffleArray(cards) : cards, algorithmMode, deckConfig, isLiveDeck };
  }

  // Fetch cards + scope card IDs in parallel (global scope will be computed after plan check)
  const [cardsResult, scopeResult] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .or(`state.eq.0,state.eq.1,state.eq.3,and(state.eq.2,scheduled_date.lte.${new Date().toISOString()})`)
      .order('created_at', { ascending: true }),
    supabase
      .from('cards')
      .select('id')
      .in('deck_id', limitScopeIds),
  ]);
  if (cardsResult.error) throw cardsResult.error;
  const cards = cardsResult.data ?? [];

  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  const limitCardIds = (scopeResult.data ?? []).map((c: any) => c.id);

  let newReviewedInHierarchy = 0;
  let reviewReviewedToday = 0;
  let globalNewReviewedToday = 0;

  // Hierarchy limits (deck-level cap)
  const hierarchyLimitsPromise = limitCardIds.length > 0
    ? supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: limitCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any)
    : Promise.resolve({ data: null });

  // For global new-card cap, only count decks within the user's active study plans
  const { data: studyPlans } = await supabase
    .from('study_plans' as any)
    .select('deck_ids, priority')
    .eq('user_id', userId)
    .order('priority', { ascending: true });

  let globalLimitsPromise: PromiseLike<any> = Promise.resolve({ data: null });
  const planDeckIdSet = new Set<string>();
  if (studyPlans && (studyPlans as any[]).length > 0) {
    for (const plan of studyPlans as any[]) {
      for (const id of (plan.deck_ids ?? [])) planDeckIdSet.add(id);
    }
    // Expand to include all descendants
    const expandedPlanDeckIds = new Set<string>(planDeckIdSet);
    for (const pid of planDeckIdSet) {
      const descendants = collectDescendantIds(allDecks ?? [], pid);
      for (const d of descendants) expandedPlanDeckIds.add(d);
    }
    const { data: planCards } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', Array.from(expandedPlanDeckIds));
    const planCardIds = (planCards ?? []).map((c: any) => c.id);
    if (planCardIds.length > 0) {
      globalLimitsPromise = supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: planCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any).then(r => r);
    }
  } else {
    // No plan exists: count all user cards globally (fallback)
    const { data: allCards } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', (allDecks ?? []).map(d => d.id));
    const allCardIds = (allCards ?? []).map((c: any) => c.id);
    if (allCardIds.length > 0) {
      globalLimitsPromise = supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: allCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any).then(r => r);
    }
  }

  const [hierarchyLimits, globalLimits] = await Promise.all([hierarchyLimitsPromise, globalLimitsPromise]);

  if (hierarchyLimits.data && (hierarchyLimits.data as any[]).length > 0) {
    const row = (hierarchyLimits.data as any[])[0];
    newReviewedInHierarchy = row.new_reviewed_today ?? 0;
    reviewReviewedToday = row.review_reviewed_today ?? 0;
  }
  if (globalLimits.data && (globalLimits.data as any[]).length > 0) {
    const row = (globalLimits.data as any[])[0];
    globalNewReviewedToday = row.new_reviewed_today ?? 0;
  }

  // Fetch global daily_new_cards_limit from profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('daily_new_cards_limit, weekly_new_cards')
    .eq('id', userId)
    .single();

  const rawGlobalLimit = (profileData as any)?.daily_new_cards_limit ?? 9999;
  const weeklyNewCards = (profileData as any)?.weekly_new_cards as Record<string, number> | null;
  const DAY_KEYS_LOCAL = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayKey = DAY_KEYS_LOCAL[new Date().getDay()];
  const globalLimit = (weeklyNewCards && weeklyNewCards[todayKey] != null) ? weeklyNewCards[todayKey] : rawGlobalLimit;

  const hasPlanActive = planDeckIdSet.size > 0;
  const deckRemaining = Math.max(0, deckNewLimit - newReviewedInHierarchy);
  const globalRemaining = Math.max(0, globalLimit - globalNewReviewedToday);

  // All plan decks share the same global remaining pool directly (no sequential splitting).
  // Priority only affects presentation order, not budget allocation.
  // No plan: only deck limit applies (global limit is a Study Plan feature)
  const effectiveNewLimit = hasPlanActive
    ? globalRemaining
    : deckRemaining;

  const effectiveReviewLimit = Math.max(0, reviewLimit - reviewReviewedToday);

  // --- Apply daily limits FIRST, then bury siblings among the surviving cards ---
  // This prevents a new card that will be cut by the limit from burying a legitimate review.
  const buryNew = deckConfig?.bury_new_siblings !== false;
  const buryReview = deckConfig?.bury_review_siblings !== false;
  const buryLearning = deckConfig?.bury_learning_siblings !== false;

  let allLearning = cards.filter(c => c.state === 1 || c.state === 3);
  let allNew = cards.filter(c => c.state === 0);
  let allReview = cards.filter(c => c.state === 2);

  // Apply daily limits BEFORE burying so cut cards don't bury others
  allNew = allNew.slice(0, effectiveNewLimit);
  allReview = allReview.slice(0, effectiveReviewLimit);

  if (buryNew || buryReview || buryLearning) {
    const seenFronts = new Set<string>();
    const buryFilter = (card: any, shouldBury: boolean) => {
      if (card.card_type !== 'cloze' || !shouldBury) return true;
      const key = card.front_content;
      if (seenFronts.has(key)) return false;
      seenFronts.add(key);
      return true;
    };
    // Process in priority order: learning first (they keep their slot),
    // then review (already earned), then new — so reviews are preserved over new cards.
    allLearning = allLearning.filter(c => buryFilter(c, buryLearning));
    allReview = allReview.filter(c => buryFilter(c, buryReview));
    allNew = allNew.filter(c => buryFilter(c, buryNew));
  }

  // Shuffle only applies to new + review cards; learning cards always go first
  const nonLearning = [...allNew, ...allReview];
  const orderedNonLearning = shuffle ? shuffleArray(nonLearning) : nonLearning;
  let queue = [...allLearning, ...orderedNonLearning];

  const isLiveDeck = deckIds.some(id => (allDecks ?? []).find(d => d.id === id)?.is_live_deck);
  return { cards: queue, algorithmMode, deckConfig, isLiveDeck };
}

/** Submit a card review and update scheduling. */
export async function submitCardReview(
  userId: string,
  card: any,
  rating: Rating,
  algorithmMode: string,
  deckConfig: any,
  elapsedMs?: number,
) {
  // Cap anti-fraude: min 1.5s, max 120s
  const cappedMs = elapsedMs
    ? Math.min(Math.max(elapsedMs, 1500), 120000)
    : null;
  if (algorithmMode === 'quick_review') {
    // Update card state: rating > 2 = "Entendi" (state 2), otherwise "Não entendi" (state 1)
    const newState = rating > 2 ? 2 : 1;
    await supabase
      .from('cards')
      .update({ state: newState, last_reviewed_at: new Date().toISOString() } as any)
      .eq('id', card.id);

    await supabase.from('review_logs').insert({
      user_id: userId,
      card_id: card.id,
      rating,
      stability: 0,
      difficulty: 0,
      scheduled_date: new Date().toISOString(),
      elapsed_ms: cappedMs,
    } as any);
    return { state: newState, stability: 0, difficulty: 0, scheduled_date: card.scheduled_date, interval_days: 0 };
  }

  const learningStepsRaw: string[] = deckConfig?.learning_steps || ['1m', '10m'];
  const learningStepsMinutes = learningStepsRaw.map(parseStepToMinutes);
  const maxIntervalDays = deckConfig?.max_interval ?? 36500;

  let result: any;

  if (algorithmMode === 'fsrs') {
    const requestedRetention = deckConfig?.requested_retention ?? 0.85;
    const params: FSRSParams = {
      ...DEFAULT_FSRS_PARAMS,
      requestedRetention,
      maximumInterval: maxIntervalDays,
      learningSteps: learningStepsMinutes,
      relearningSteps: [learningStepsMinutes[0] ?? 10],
    };

    const fsrsCard: FSRSCard = {
      stability: card.stability,
      difficulty: card.difficulty,
      state: card.state,
      scheduled_date: card.scheduled_date,
      learning_step: card.learning_step ?? 0,
      last_reviewed_at: card.last_reviewed_at ?? undefined,
    };

    result = fsrsSchedule(fsrsCard, rating, params);
  } else {
    const easyBonusPct = (deckConfig?.easy_bonus ?? 130) / 100;
    const intervalModPct = (deckConfig?.interval_modifier ?? 100) / 100;

    const sm2Params: SM2Params = {
      learningSteps: learningStepsMinutes,
      easyBonus: easyBonusPct,
      intervalModifier: intervalModPct,
      maxInterval: maxIntervalDays,
    };

    const sm2Card: SM2Card = {
      stability: card.stability,
      difficulty: card.difficulty,
      state: card.state,
      scheduled_date: card.scheduled_date,
    };

    result = sm2Schedule(sm2Card, rating, sm2Params);
  }

    const [updateResult, logResult] = await Promise.all([
      supabase
        .from('cards')
        .update({
          stability: result.stability,
          difficulty: result.difficulty,
          state: result.state,
          scheduled_date: result.scheduled_date,
          last_reviewed_at: new Date().toISOString(),
          learning_step: result.learning_step ?? 0,
        } as any)
        .eq('id', card.id),
      supabase
        .from('review_logs')
        .insert({
          user_id: userId,
          card_id: card.id,
          rating,
          stability: result.stability,
          difficulty: result.difficulty,
          scheduled_date: result.scheduled_date,
          state: card.state,
          elapsed_ms: cappedMs,
        } as any),
    ]);
    if (updateResult.error) throw updateResult.error;
    if (logResult.error) throw logResult.error;

  return result;
}

import type { StudyStats } from '@/types/study';
export type { StudyStats } from '@/types/study';

/** Fetch study statistics for the current user. */
export async function fetchStudyStats(userId: string): Promise<StudyStats> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('energy, daily_energy_earned, last_study_reset_date, daily_cards_studied, created_at')
    .eq('id', userId)
    .single();

  const p = profile as any;
  const energy = p?.energy ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const dailyEnergyEarned = p?.last_study_reset_date === today ? (p?.daily_energy_earned ?? 0) : 0;
  const todayCards = p?.last_study_reset_date === today ? (p?.daily_cards_studied ?? 0) : 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: logs } = await supabase
    .from('review_logs')
    .select('reviewed_at, elapsed_ms')
    .eq('user_id', userId)
    .gte('reviewed_at', thirtyDaysAgo.toISOString())
    .order('reviewed_at', { ascending: true });

  if (!logs || logs.length === 0) {
    return { lastStudyDate: null, streak: 0, energy, dailyEnergyEarned, mascotState: 'sleeping', todayCards, avgMinutesPerDay7d: 0, todayMinutes: 0 };
  }

  const lastStudyDate = new Date(logs[logs.length - 1].reviewed_at);
  const streak = calculateStreak(logs.map(l => l.reviewed_at));
  const mascotState = getMascotState(lastStudyDate);

  // --- Hybrid minute calculation: elapsed_ms when available, gap-based fallback ---
  const MIN_REVIEW_MS = 1500;
  const MAX_REVIEW_MS = 120000;

  const calcMinutesFromLogs = (reviewLogs: { reviewed_at: string; elapsed_ms?: number | null }[]): number => {
    if (reviewLogs.length === 0) return 0;
    let totalMs = 0;
    let sessions = 1;
    // First card: use elapsed_ms if available, otherwise 15s estimate
    if (reviewLogs[0].elapsed_ms) {
      totalMs += reviewLogs[0].elapsed_ms;
    } else {
      totalMs += 15000;
    }
    for (let i = 1; i < reviewLogs.length; i++) {
      const log = reviewLogs[i];
      if (log.elapsed_ms) {
        // Real timer data available
        totalMs += log.elapsed_ms;
      } else {
        // Fallback: gap-based for old logs without elapsed_ms
        const gap = new Date(log.reviewed_at).getTime() - new Date(reviewLogs[i - 1].reviewed_at).getTime();
        if (gap >= MIN_REVIEW_MS && gap <= MAX_REVIEW_MS) {
          totalMs += gap;
        } else if (gap > MAX_REVIEW_MS) {
          totalMs += MAX_REVIEW_MS;
        }
      }
      // Detect new session (gap > 5 min)
      const gap = new Date(log.reviewed_at).getTime() - new Date(reviewLogs[i - 1].reviewed_at).getTime();
      if (gap > 300000) sessions++;
    }
    // For old logs without elapsed_ms, add session bonuses (minus the first card already counted)
    const hasElapsed = reviewLogs.some(l => l.elapsed_ms);
    if (!hasElapsed) {
      totalMs += (sessions - 1) * 15000;
    }
    return Math.round(totalMs / 60000);
  };

  // Use local midnight for today filter
  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStart = localMidnight.toISOString();
  const todayLogs = (logs as any[]).filter(l => l.reviewed_at >= todayStart);
  const todayMinutes = calcMinutesFromLogs(todayLogs);

  const accountCreated = p?.created_at ? new Date(p.created_at) : new Date();
  const daysSinceCreation = Math.max(1, Math.ceil((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)));
  const activeDays = Math.min(daysSinceCreation, 7);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const last7dLogs = (logs as any[]).filter(l => new Date(l.reviewed_at) >= sevenDaysAgo);
  const total7dMinutes = calcMinutesFromLogs(last7dLogs);
  const avgMinutesPerDay7d = Math.round(total7dMinutes / activeDays);

  return { lastStudyDate, streak, energy, dailyEnergyEarned, mascotState, todayCards, avgMinutesPerDay7d, todayMinutes };
}
