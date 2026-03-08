/**
 * Service layer for study sessions and study statistics.
 * Abstracts all Supabase queries for study-related data.
 */

import { supabase } from '@/integrations/supabase/client';
import { fsrsSchedule, type Rating, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { sm2Schedule, type SM2Card, type SM2Params } from '@/lib/sm2';
import { parseStepToMinutes, shuffleArray, collectDescendantIds, collectFolderDeckIds, findRootAncestorId } from '@/lib/studyUtils';

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
    .select('id, parent_deck_id, folder_id, daily_new_limit, daily_review_limit, algorithm_mode, learning_steps, requested_retention, max_interval, interval_modifier, easy_bonus, easy_graduating_interval, shuffle_cards, is_live_deck, bury_siblings, bury_new_siblings, bury_review_siblings, bury_learning_siblings, is_archived')
    .eq('user_id', userId);

  // Filter out archived decks from consideration
  const activeDecks = (allDecks ?? []).filter(d => !d.is_archived);

  let deckIds: string[];
  let deckConfig: any;
  let limitScopeIds: string[];

  if (folderId) {
    const { data: allFolders } = await supabase
      .from('folders')
      .select('id, parent_id')
      .eq('user_id', userId);

    const rootDeckIds = collectFolderDeckIds(activeDecks, allFolders ?? [], folderId);
    const allDescendants = rootDeckIds.flatMap(id => collectDescendantIds(activeDecks, id));
    deckIds = [...new Set([...rootDeckIds, ...allDescendants])];
    const firstDeck = activeDecks.find(d => deckIds.includes(d.id));
    deckConfig = firstDeck ?? {};
    limitScopeIds = deckIds;
  } else {
    const descendantIds = collectDescendantIds(activeDecks, deckId);
    deckIds = [deckId, ...descendantIds];

    // Root ancestor's config governs ALL descendants
    const rootId = findRootAncestorId(activeDecks, deckId);
    deckConfig = activeDecks.find(d => d.id === rootId) ?? {};

    // Count limits across the ENTIRE root hierarchy
    const rootDescendants = collectDescendantIds(activeDecks, rootId);
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
    const isLiveDeck = deckIds.some(id => activeDecks.find(d => d.id === id)?.is_live_deck);
    return { cards: shuffle ? shuffleArray(cards) : cards, algorithmMode, deckConfig, isLiveDeck };
  }

  // Fetch cards + scope card IDs in parallel
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayISO = endOfToday.toISOString();
  const nowISO = new Date().toISOString();
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  // Parallelize: cards, scope IDs, study plans, and profile all at once
  const [cardsResult, scopeResult, plansResult, profileResult] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .or(`and(state.eq.0,or(scheduled_date.is.null,scheduled_date.lte.${endOfTodayISO})),and(state.in.(1,3),scheduled_date.lte.${endOfTodayISO}),and(state.eq.2,scheduled_date.lte.${nowISO})`)
      .order('created_at', { ascending: true }),
    supabase
      .from('cards')
      .select('id')
      .in('deck_id', limitScopeIds),
    supabase
      .from('study_plans' as any)
      .select('deck_ids, priority')
      .eq('user_id', userId)
      .order('priority', { ascending: true }),
    supabase
      .from('profiles')
      .select('daily_new_cards_limit, weekly_new_cards')
      .eq('id', userId)
      .single(),
  ]);

  if (cardsResult.error) throw cardsResult.error;
  const cards = cardsResult.data ?? [];
  const limitCardIds = (scopeResult.data ?? []).map((c: any) => c.id);
  const studyPlans = plansResult.data as any[] | null;
  const profileData = profileResult.data as any;

  // Build plan deck IDs and fetch plan card IDs + hierarchy limits in parallel
  const planDeckIdSet = new Set<string>();
  if (studyPlans && studyPlans.length > 0) {
    for (const plan of studyPlans) {
      for (const id of (plan.deck_ids ?? [])) planDeckIdSet.add(id);
    }
  }

  // Expand plan deck IDs to include descendants
  const expandedPlanDeckIds = new Set<string>(planDeckIdSet);
  for (const pid of planDeckIdSet) {
    const descendants = collectDescendantIds(activeDecks, pid);
    for (const d of descendants) expandedPlanDeckIds.add(d);
  }

  // Determine which card IDs to use for global limits
  let globalCardIdsPromise: Promise<string[]>;
  if (planDeckIdSet.size > 0) {
    globalCardIdsPromise = supabase
      .from('cards')
      .select('id')
      .in('deck_id', Array.from(expandedPlanDeckIds))
      .then(r => (r.data ?? []).map((c: any) => c.id));
  } else {
    globalCardIdsPromise = supabase
      .from('cards')
      .select('id')
      .in('deck_id', activeDecks.map(d => d.id))
      .then(r => (r.data ?? []).map((c: any) => c.id));
  }

  // Fetch hierarchy limits and global card IDs in parallel
  const hierarchyLimitsPromise = limitCardIds.length > 0
    ? supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: limitCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any)
    : Promise.resolve({ data: null });

  const [hierarchyLimits, globalCardIds] = await Promise.all([hierarchyLimitsPromise, globalCardIdsPromise]);

  // Now fetch global limits RPC
  let globalNewReviewedToday = 0;
  if (globalCardIds.length > 0) {
    const globalLimits = await supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: globalCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any);
    if (globalLimits.data && (globalLimits.data as any[]).length > 0) {
      globalNewReviewedToday = (globalLimits.data as any[])[0].new_reviewed_today ?? 0;
    }
  }

  let newReviewedInHierarchy = 0;
  let reviewReviewedToday = 0;

  if (hierarchyLimits.data && (hierarchyLimits.data as any[]).length > 0) {
    const row = (hierarchyLimits.data as any[])[0];
    newReviewedInHierarchy = row.new_reviewed_today ?? 0;
    reviewReviewedToday = row.review_reviewed_today ?? 0;
  }

  // Profile limits
  const rawGlobalLimit = profileData?.daily_new_cards_limit ?? 9999;
  const weeklyNewCards = profileData?.weekly_new_cards as Record<string, number> | null;
  const DAY_KEYS_LOCAL = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayKey = DAY_KEYS_LOCAL[new Date().getDay()];
  const globalLimit = (weeklyNewCards && weeklyNewCards[todayKey] != null) ? weeklyNewCards[todayKey] : rawGlobalLimit;

  const hasPlanActive = planDeckIdSet.size > 0;
  const deckRemaining = Math.max(0, deckNewLimit - newReviewedInHierarchy);
  const globalRemaining = Math.max(0, globalLimit - globalNewReviewedToday);

  const effectiveNewLimit = hasPlanActive ? globalRemaining : deckRemaining;
  const effectiveReviewLimit = Math.max(0, reviewLimit - reviewReviewedToday);

  // --- Apply daily limits FIRST, then bury siblings among the surviving cards ---
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
    allLearning = allLearning.filter(c => buryFilter(c, buryLearning));
    allReview = allReview.filter(c => buryFilter(c, buryReview));
    allNew = allNew.filter(c => buryFilter(c, buryNew));
  }

  // Shuffle only applies to new + review cards; learning cards always go first
  const nonLearning = [...allNew, ...allReview];
  const orderedNonLearning = shuffle ? shuffleArray(nonLearning) : nonLearning;
  let queue = [...allLearning, ...orderedNonLearning];

  const isLiveDeck = deckIds.some(id => activeDecks.find(d => d.id === id)?.is_live_deck);
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
    return { state: newState, stability: 0, difficulty: 0, scheduled_date: card.scheduled_date, interval_days: 1 };
  }

  const learningStepsRaw: string[] = deckConfig?.learning_steps || ['1m', '10m'];
  const learningStepsMinutes = learningStepsRaw.map(parseStepToMinutes);
  const maxIntervalDays = deckConfig?.max_interval ?? 36500;

  let result: any;

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

/** Fetch study statistics using server-side RPC (eliminates 1500+ row transfer). */
export async function fetchStudyStats(userId: string, _cachedProfile?: any): Promise<StudyStats> {
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  const { data, error } = await supabase.rpc('get_study_stats_summary', {
    p_user_id: userId,
    p_tz_offset_minutes: tzOffsetMinutes,
  } as any);

  if (error) throw error;

  const result = data as any;
  if (!result) {
    return {
      lastStudyDate: null,
      streak: 0,
      energy: 0,
      dailyEnergyEarned: 0,
      mascotState: 'sleeping',
      todayCards: 0,
      avgMinutesPerDay7d: 0,
      todayMinutes: 0,
      freezesAvailable: 0,
    };
  }

  return {
    lastStudyDate: result.last_study_date ? new Date(result.last_study_date) : null,
    streak: result.streak ?? 0,
    energy: result.energy ?? 0,
    dailyEnergyEarned: result.daily_energy_earned ?? 0,
    mascotState: result.mascot_state ?? 'sleeping',
    todayCards: result.today_cards ?? 0,
    avgMinutesPerDay7d: result.avg_minutes_7d ?? 0,
    todayMinutes: result.today_minutes ?? 0,
    freezesAvailable: result.freezes_available ?? 0,
  };
}
