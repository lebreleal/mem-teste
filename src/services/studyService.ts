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
import { fsrsSchedule, type Rating, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { sm2Schedule, type SM2Card, type SM2Params } from '@/lib/sm2';
import { parseStepToMinutes, shuffleArray, collectDescendantIds, collectFolderDeckIds, findRootAncestorId } from '@/lib/studyUtils';
import { TZ_OFFSET_SP } from '@/lib/dateUtils';

export interface StudyQueueResult {
  cards: any[];
  algorithmMode: string;
  deckConfig: any;
  isLiveDeck: boolean;
}

const DECK_SELECT_COLS = 'id, parent_deck_id, folder_id, daily_new_limit, daily_review_limit, algorithm_mode, learning_steps, requested_retention, max_interval, interval_modifier, easy_bonus, easy_graduating_interval, shuffle_cards, is_live_deck, source_turma_deck_id, source_listing_id, bury_siblings, bury_new_siblings, bury_review_siblings, bury_learning_siblings, is_archived' as const;

/** Fetch the study queue for a deck or folder. */
export async function fetchStudyQueue(
  userId: string,
  deckId: string,
  folderId?: string,
): Promise<StudyQueueResult> {
  // ─── Round 1: base data (parallel) ───
  const [decksResult, foldersResult] = await Promise.all([
    supabase.from('decks').select(DECK_SELECT_COLS).eq('user_id', userId),
    folderId
      ? supabase.from('folders').select('id, parent_id').eq('user_id', userId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const activeDecks = (decksResult.data ?? []).filter(d => !d.is_archived);

  let deckIds: string[];
  let deckConfig: any;
  let limitScopeIds: string[];

  if (folderId) {
    const rootDeckIds = collectFolderDeckIds(activeDecks, foldersResult.data ?? [], folderId);
    const allDescendants = rootDeckIds.flatMap(id => collectDescendantIds(activeDecks, id));
    deckIds = [...new Set([...rootDeckIds, ...allDescendants])];
    const firstDeck = activeDecks.find(d => deckIds.includes(d.id));
    deckConfig = firstDeck ?? {};
    limitScopeIds = deckIds;
  } else {
    const descendantIds = collectDescendantIds(activeDecks, deckId);
    deckIds = [deckId, ...descendantIds];
    const rootId = findRootAncestorId(activeDecks, deckId);
    deckConfig = activeDecks.find(d => d.id === rootId) ?? {};
    const rootDescendants = collectDescendantIds(activeDecks, rootId);
    limitScopeIds = [rootId, ...rootDescendants];
  }

  const deckNewLimit = deckConfig?.daily_new_limit ?? 20;
  const reviewLimit = deckConfig?.daily_review_limit ?? 100;
  const algorithmMode = deckConfig?.algorithm_mode || 'fsrs';
  const shuffle = deckConfig?.shuffle_cards ?? false;

  // Quick-review mode: just fetch all cards, no limits
  if (algorithmMode === 'quick_review') {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const cards = data ?? [];
    const isLiveDeck = deckIds.some(id => {
      const d = activeDecks.find(dd => dd.id === id);
      return d?.is_live_deck || d?.source_turma_deck_id || d?.source_listing_id;
    });
    return { cards: shuffle ? shuffleArray(cards) : cards, algorithmMode, deckConfig, isLiveDeck };
  }

  // ─── Round 2: cards + allCardIds + plans + profile (parallel) ───
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayISO = endOfToday.toISOString();
  const nowISO = new Date().toISOString();
  const tzOffsetMinutes = TZ_OFFSET_SP;
  const allActiveDeckIds = activeDecks.map(d => d.id);

  // Paginated fetch for all card IDs (Supabase caps at 1000 rows per query)
  const fetchAllCardIds = async (): Promise<{ id: string; deck_id: string }[]> => {
    const PAGE = 1000;
    const IN_BATCH = 300;
    const rows: { id: string; deck_id: string }[] = [];
    for (let i = 0; i < allActiveDeckIds.length; i += IN_BATCH) {
      const batch = allActiveDeckIds.slice(i, i + IN_BATCH);
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('cards')
          .select('id, deck_id')
          .in('deck_id', batch)
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const chunk = data ?? [];
        rows.push(...chunk);
        hasMore = chunk.length === PAGE;
        offset += PAGE;
      }
    }
    return rows;
  };

  const [cardsResult, allCardRows, plansResult, profileResult] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .or(`and(state.eq.0,or(scheduled_date.is.null,scheduled_date.lte.${endOfTodayISO})),and(state.in.(1,3),scheduled_date.lte.${endOfTodayISO}),and(state.eq.2,scheduled_date.lte.${nowISO})`)
      .order('created_at', { ascending: true }),
    fetchAllCardIds(),
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
  // allCardRows already resolved from fetchAllCardIds() above
  const studyPlans = plansResult.data as any[] | null;
  const profileData = profileResult.data as any;

  // Derive limitCardIds and globalCardIds from allCardRows (JS filtering, no extra queries)
  const limitScopeSet = new Set(limitScopeIds);
  const limitCardIds = allCardRows.filter(c => limitScopeSet.has(c.deck_id)).map(c => c.id);

  // Build global scope deck IDs
  const planDeckIdSet = new Set<string>();
  if (studyPlans && studyPlans.length > 0) {
    for (const plan of studyPlans) {
      for (const id of (plan.deck_ids ?? [])) planDeckIdSet.add(id);
    }
  }
  const expandedPlanDeckIds = new Set<string>(planDeckIdSet);
  for (const pid of planDeckIdSet) {
    for (const d of collectDescendantIds(activeDecks, pid)) expandedPlanDeckIds.add(d);
  }
  const globalScopeDeckIdSet = planDeckIdSet.size > 0
    ? expandedPlanDeckIds
    : new Set(allActiveDeckIds);
  const globalCardIds = allCardRows.filter(c => globalScopeDeckIdSet.has(c.deck_id)).map(c => c.id);

  // ─── Round 3: both limits RPCs in parallel ───
  const [hierarchyLimits, globalLimitsResult] = await Promise.all([
    limitCardIds.length > 0
      ? supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: limitCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any)
      : Promise.resolve({ data: null }),
    globalCardIds.length > 0
      ? supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: globalCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any)
      : Promise.resolve({ data: null }),
  ]);

  let newReviewedInHierarchy = 0;
  let reviewReviewedToday = 0;
  if (hierarchyLimits.data && (hierarchyLimits.data as any[]).length > 0) {
    const row = (hierarchyLimits.data as any[])[0];
    newReviewedInHierarchy = row.new_reviewed_today ?? 0;
    reviewReviewedToday = row.review_reviewed_today ?? 0;
  }

  let globalNewReviewedToday = 0;
  if (globalLimitsResult.data && (globalLimitsResult.data as any[]).length > 0) {
    globalNewReviewedToday = (globalLimitsResult.data as any[])[0].new_reviewed_today ?? 0;
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

  const nonLearning = [...allNew, ...allReview];
  const orderedNonLearning = shuffle ? shuffleArray(nonLearning) : nonLearning;
  const queue = [...allLearning, ...orderedNonLearning];

  const isLiveDeck = deckIds.some(id => {
    const d = activeDecks.find(dd => dd.id === id);
    return d?.is_live_deck || d?.source_turma_deck_id || d?.source_listing_id;
  });
  return { cards: queue, algorithmMode, deckConfig, isLiveDeck };
}

export interface UnifiedStudyQueueResult {
  cards: any[];
  /** Map of deckId → deck config for per-card config resolution */
  deckConfigs: Record<string, any>;
  isLiveDeck: boolean;
}

/**
 * Fetch a unified study queue from ALL user decks (or plan-scoped decks).
 * Interleaves cards across decks: learning → review → new.
 * Respects per-deck daily_new_limit, daily_review_limit, and global new limit.
 */
export async function fetchUnifiedStudyQueue(
  userId: string,
): Promise<UnifiedStudyQueueResult> {
  // ─── Round 1: decks + plans + profile (parallel) ───
  const [decksResult, plansResult, profileResult] = await Promise.all([
    supabase.from('decks').select(DECK_SELECT_COLS).eq('user_id', userId),
    supabase.from('study_plans' as any).select('deck_ids, priority').eq('user_id', userId).order('priority', { ascending: true }),
    supabase.from('profiles').select('daily_new_cards_limit, weekly_new_cards').eq('id', userId).single(),
  ]);

  const activeDecks = (decksResult.data ?? []).filter((d: any) => !d.is_archived);
  const studyPlans = plansResult.data as any[] | null;
  const profileData = profileResult.data as any;

  // Determine scope: plan mode or all
  const planDeckIdSet = new Set<string>();
  if (studyPlans && studyPlans.length > 0) {
    for (const plan of studyPlans) {
      for (const id of (plan.deck_ids ?? [])) planDeckIdSet.add(id);
    }
  }
  const hasPlan = planDeckIdSet.size > 0;

  // Find root decks in scope
  const roots = activeDecks.filter((d: any) => !d.parent_deck_id);
  let scopedRoots: any[];

  if (hasPlan) {
    const getRootId = (id: string): string | null => {
      const d = activeDecks.find((x: any) => x.id === id);
      if (!d) return null;
      return d.parent_deck_id ? getRootId(d.parent_deck_id) : d.id;
    };
    const rootIds = new Set<string>();
    for (const id of planDeckIdSet) {
      const rid = getRootId(id);
      if (rid) rootIds.add(rid);
    }
    scopedRoots = roots.filter((d: any) => rootIds.has(d.id));
  } else {
    scopedRoots = roots;
  }

  // Build deckConfigs map (root config for each hierarchy)
  const deckConfigs: Record<string, any> = {};
  const allScopedDeckIds: string[] = [];
  const rootForDeck: Record<string, string> = {};

  for (const root of scopedRoots) {
    const descendants = collectDescendantIds(activeDecks, root.id);
    const hierarchy = [root.id, ...descendants];
    for (const id of hierarchy) {
      deckConfigs[id] = root; // root config applies to all descendants
      rootForDeck[id] = root.id;
      allScopedDeckIds.push(id);
    }
  }

  if (allScopedDeckIds.length === 0) {
    return { cards: [], deckConfigs, isLiveDeck: false };
  }

  // ─── Round 2: fetch due cards + allCardIds for limits (parallel) ───
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayISO = endOfToday.toISOString();
  const nowISO = new Date().toISOString();
  const tzOffsetMinutes = TZ_OFFSET_SP;

  // Batch fetch due cards across all scoped decks
  const IN_BATCH = 300;
  const fetchDueCards = async (): Promise<any[]> => {
    const allCards: any[] = [];
    for (let i = 0; i < allScopedDeckIds.length; i += IN_BATCH) {
      const batch = allScopedDeckIds.slice(i, i + IN_BATCH);
      const PAGE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('cards')
          .select('*')
          .in('deck_id', batch)
          .or(`and(state.eq.0,or(scheduled_date.is.null,scheduled_date.lte.${endOfTodayISO})),and(state.in.(1,3),scheduled_date.lte.${endOfTodayISO}),and(state.eq.2,scheduled_date.lte.${nowISO})`)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const chunk = data ?? [];
        allCards.push(...chunk);
        hasMore = chunk.length === PAGE;
        offset += PAGE;
      }
    }
    return allCards;
  };

  // Also fetch all card IDs for limit calculation
  const fetchAllCardIds = async (): Promise<{ id: string; deck_id: string }[]> => {
    const rows: { id: string; deck_id: string }[] = [];
    for (let i = 0; i < allScopedDeckIds.length; i += IN_BATCH) {
      const batch = allScopedDeckIds.slice(i, i + IN_BATCH);
      const PAGE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('cards')
          .select('id, deck_id')
          .in('deck_id', batch)
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const chunk = data ?? [];
        rows.push(...chunk);
        hasMore = chunk.length === PAGE;
        offset += PAGE;
      }
    }
    return rows;
  };

  const [allDueCards, allCardRows] = await Promise.all([fetchDueCards(), fetchAllCardIds()]);

  // ─── Round 3: Per-root hierarchy limits (parallel RPCs) ───
  const rootIds = [...new Set(scopedRoots.map((r: any) => r.id))];
  const limitPromises = rootIds.map(rootId => {
    const hierarchyCardIds = allCardRows.filter(c => rootForDeck[c.deck_id] === rootId).map(c => c.id);
    if (hierarchyCardIds.length === 0) return Promise.resolve({ rootId, data: null });
    return supabase.rpc('get_study_queue_limits', {
      p_user_id: userId, p_card_ids: hierarchyCardIds, p_tz_offset_minutes: tzOffsetMinutes,
    } as any).then(res => ({ rootId, data: res.data }));
  });

  // Global limits RPC
  const globalCardIds = allCardRows.map(c => c.id);
  const globalLimitPromise = globalCardIds.length > 0
    ? supabase.rpc('get_study_queue_limits', { p_user_id: userId, p_card_ids: globalCardIds, p_tz_offset_minutes: tzOffsetMinutes } as any)
    : Promise.resolve({ data: null });

  const [limitResults, globalLimitsResult] = await Promise.all([
    Promise.all(limitPromises),
    globalLimitPromise,
  ]);

  // Parse per-root limits
  const rootLimits: Record<string, { newReviewed: number; reviewReviewed: number }> = {};
  for (const lr of limitResults) {
    if (lr.data && (lr.data as any[]).length > 0) {
      const row = (lr.data as any[])[0];
      rootLimits[lr.rootId] = {
        newReviewed: row.new_reviewed_today ?? 0,
        reviewReviewed: row.review_reviewed_today ?? 0,
      };
    } else {
      rootLimits[lr.rootId] = { newReviewed: 0, reviewReviewed: 0 };
    }
  }

  let globalNewReviewedToday = 0;
  if (globalLimitsResult.data && (globalLimitsResult.data as any[]).length > 0) {
    globalNewReviewedToday = (globalLimitsResult.data as any[])[0].new_reviewed_today ?? 0;
  }

  // Profile limits
  const rawGlobalLimit = profileData?.daily_new_cards_limit ?? 9999;
  const weeklyNewCards = profileData?.weekly_new_cards as Record<string, number> | null;
  const DAY_KEYS_LOCAL = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayKey = DAY_KEYS_LOCAL[new Date().getDay()];
  const globalLimit = (weeklyNewCards && weeklyNewCards[todayKey] != null) ? weeklyNewCards[todayKey] : rawGlobalLimit;
  const globalNewRemaining = Math.max(0, globalLimit - globalNewReviewedToday);

  // ─── Apply limits per root hierarchy ───
  const allLearning: any[] = [];
  const allReview: any[] = [];
  const allNew: any[] = [];
  let totalNewAllowed = 0;

  // Group cards by root
  const cardsByRoot: Record<string, any[]> = {};
  for (const card of allDueCards) {
    const root = rootForDeck[card.deck_id];
    if (!root) continue;
    if (!cardsByRoot[root]) cardsByRoot[root] = [];
    cardsByRoot[root].push(card);
  }

  for (const rootId of rootIds) {
    const cards = cardsByRoot[rootId] ?? [];
    const rootConfig = deckConfigs[rootId] ?? {};
    const rl = rootLimits[rootId] ?? { newReviewed: 0, reviewReviewed: 0 };

    const deckNewLimit = rootConfig.daily_new_limit ?? 20;
    const reviewLimit = rootConfig.daily_review_limit ?? 100;

    const effectiveNewLimit = hasPlan
      ? cards.filter((c: any) => c.state === 0).length // will be globally capped later
      : Math.max(0, deckNewLimit - rl.newReviewed);
    const effectiveReviewLimit = Math.max(0, reviewLimit - rl.reviewReviewed);

    const learning = cards.filter((c: any) => c.state === 1 || c.state === 3);
    const review = cards.filter((c: any) => c.state === 2).slice(0, effectiveReviewLimit);
    const newCards = cards.filter((c: any) => c.state === 0).slice(0, effectiveNewLimit);

    allLearning.push(...learning);
    allReview.push(...review);
    allNew.push(...newCards);
    totalNewAllowed += newCards.length;
  }

  // Apply global new cap
  if (hasPlan && allNew.length > globalNewRemaining) {
    allNew.splice(globalNewRemaining);
  } else if (!hasPlan && allNew.length > globalNewRemaining) {
    allNew.splice(globalNewRemaining);
  }

  // Interleave: learning first, then shuffle review+new together
  const nonLearning = [...allReview, ...allNew];
  const shuffled = shuffleArray(nonLearning);
  const queue = [...allLearning, ...shuffled];

  const isLiveDeck = allScopedDeckIds.some(id => {
    const d = activeDecks.find((dd: any) => dd.id === id);
    return d?.is_live_deck || d?.source_turma_deck_id || d?.source_listing_id;
  });

  return { cards: queue, deckConfigs, isLiveDeck };
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
      user_id: userId, card_id: card.id, rating, stability: 0, difficulty: 0,
      scheduled_date: new Date().toISOString(), elapsed_ms: cappedMs,
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

  const [updateResult, logResult] = await Promise.all([
    supabase.from('cards').update({
      stability: result.stability, difficulty: result.difficulty,
      state: result.state, scheduled_date: result.scheduled_date,
      last_reviewed_at: new Date().toISOString(), learning_step: result.learning_step ?? 0,
    } as any).eq('id', card.id),
    supabase.from('review_logs').insert({
      user_id: userId, card_id: card.id, rating,
      stability: result.stability, difficulty: result.difficulty,
      scheduled_date: result.scheduled_date, state: card.state, elapsed_ms: cappedMs,
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
  const tzOffsetMinutes = TZ_OFFSET_SP;
  const { data, error } = await supabase.rpc('get_study_stats_summary', {
    p_user_id: userId, p_tz_offset_minutes: tzOffsetMinutes,
  } as any);
  if (error) throw error;
  const result = data as any;
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
