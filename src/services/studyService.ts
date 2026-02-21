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
}

/** Fetch the study queue for a deck or folder. */
export async function fetchStudyQueue(
  userId: string,
  deckId: string,
  folderId?: string,
): Promise<StudyQueueResult> {
  const { data: allDecks } = await supabase
    .from('decks')
    .select('id, parent_deck_id, folder_id, daily_new_limit, daily_review_limit, algorithm_mode, learning_steps, requested_retention, max_interval, interval_modifier, easy_bonus, shuffle_cards')
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

  const newLimit = deckConfig?.daily_new_limit ?? 20;
  const reviewLimit = deckConfig?.daily_review_limit ?? 100;
  const algorithmMode = deckConfig?.algorithm_mode || 'sm2';
  const shuffle = deckConfig?.shuffle_cards ?? false;

  if (algorithmMode === 'quick_review') {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const cards = data ?? [];
    return { cards: shuffle ? shuffleArray(cards) : cards, algorithmMode, deckConfig };
  }

  // Fetch cards + scope card IDs in parallel (independent queries)
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

  // Count today's reviews across the ENTIRE root hierarchy using single RPC
  let newReviewedToday = 0;
  let reviewReviewedToday = 0;

  const limitCardIds = (scopeResult.data ?? []).map((c: any) => c.id);

  if (limitCardIds.length > 0) {
    const tzOffsetMinutes = -new Date().getTimezoneOffset();
    const { data: limits } = await supabase.rpc('get_study_queue_limits', {
      p_user_id: userId,
      p_card_ids: limitCardIds,
      p_tz_offset_minutes: tzOffsetMinutes,
    } as any);
    if (limits && (limits as any[]).length > 0) {
      const row = (limits as any[])[0];
      newReviewedToday = row.new_reviewed_today ?? 0;
      reviewReviewedToday = row.review_reviewed_today ?? 0;
    }
  }

  // Fetch plan allocation for smart new card distribution
  let planNewLimit: number | undefined;
  const { data: profileData } = await supabase
    .from('profiles')
    .select('daily_new_cards_limit')
    .eq('id', userId)
    .single();

  {
    const globalLimit = (profileData as any)?.daily_new_cards_limit ?? 30;
    // Fetch all study plans to compute allocation
    const { data: plansData } = await supabase
      .from('study_plans')
      .select('deck_ids, target_date, priority')
      .eq('user_id', userId)
      .order('priority', { ascending: true });
    
    if (plansData && plansData.length > 0) {
      // Check if this deck belongs to any plan
      const allPlanDeckIds = new Set<string>();
      for (const p of plansData as any[]) {
        for (const id of (p.deck_ids ?? [])) allPlanDeckIds.add(id);
      }
      
      if (deckIds.some(id => allPlanDeckIds.has(id))) {
        // Count new cards per deck in plans
        const { data: newCounts } = await supabase
          .from('cards')
          .select('deck_id')
          .in('deck_id', Array.from(allPlanDeckIds))
          .eq('state', 0);
        
        const newPerDeck: Record<string, number> = {};
        for (const c of (newCounts ?? []) as any[]) {
          newPerDeck[c.deck_id] = (newPerDeck[c.deck_id] ?? 0) + 1;
        }

        // Calculate weights: newRemaining / daysLeft
        const weights: Record<string, number> = {};
        for (const p of plansData as any[]) {
          const daysLeft = p.target_date
            ? Math.max(1, Math.ceil((new Date(p.target_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000))
            : 90;
          for (const did of (p.deck_ids ?? []) as string[]) {
            if (weights[did] != null) continue;
            const remaining = newPerDeck[did] ?? 0;
            if (remaining === 0) continue;
            weights[did] = remaining / daysLeft;
          }
        }

        const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
        if (totalWeight > 0) {
          // Find allocation for the current deck(s)
          let budgetRemaining = globalLimit;
          const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
          const allocation: Record<string, number> = {};
          for (const [did, w] of sorted) {
            if (budgetRemaining <= 0) { allocation[did] = 0; continue; }
            const share = Math.max(1, Math.round(globalLimit * (w / totalWeight)));
            const capped = Math.min(share, budgetRemaining);
            allocation[did] = capped;
            budgetRemaining -= capped;
          }
          // Sum allocation for all deckIds in this study session
          const totalForSession = deckIds.reduce((s, id) => s + (allocation[id] ?? 0), 0);
          if (totalForSession > 0) {
            planNewLimit = totalForSession;
          }
        }
      }
    }
  }

  // When a plan is active, plan allocation governs completely (ignores deck's manual limit)
  const baseNewLimit = planNewLimit != null
    ? planNewLimit
    : newLimit;
  const effectiveNewLimit = Math.max(0, baseNewLimit - newReviewedToday);
  const effectiveReviewLimit = Math.max(0, reviewLimit - reviewReviewedToday);

  const newCards = cards.filter(c => c.state === 0).slice(0, effectiveNewLimit);
  const learningCards = cards.filter(c => c.state === 1 || c.state === 3);
  const reviewCards = cards.filter(c => c.state === 2).slice(0, effectiveReviewLimit);

  // Shuffle only applies to new + review cards; learning cards always go first (they cut the line when ready)
  const nonLearning = [...newCards, ...reviewCards];
  const orderedNonLearning = shuffle ? shuffleArray(nonLearning) : nonLearning;
  const queue = [...learningCards, ...orderedNonLearning];
  return { cards: queue, algorithmMode, deckConfig };
}

/** Submit a card review and update scheduling. */
export async function submitCardReview(
  userId: string,
  card: any,
  rating: Rating,
  algorithmMode: string,
  deckConfig: any,
) {
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
    });
    return { state: newState, stability: 0, difficulty: 0, scheduled_date: card.scheduled_date, interval_days: 0 };
  }

  const learningStepsRaw: string[] = deckConfig?.learning_steps || ['1m', '15m'];
  const learningStepsMinutes = learningStepsRaw.map(parseStepToMinutes);
  const maxIntervalDays = deckConfig?.max_interval ?? 36500;

  let result: any;

  if (algorithmMode === 'fsrs') {
    const requestedRetention = deckConfig?.requested_retention ?? 0.9;
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

    const { error: updateError } = await supabase
      .from('cards')
      .update({
        stability: result.stability,
        difficulty: result.difficulty,
        state: result.state,
        scheduled_date: result.scheduled_date,
        last_reviewed_at: new Date().toISOString(),
      } as any)
      .eq('id', card.id);
  if (updateError) throw updateError;

  const { error: logError } = await supabase
    .from('review_logs')
    .insert({
      user_id: userId,
      card_id: card.id,
      rating,
      stability: result.stability,
      difficulty: result.difficulty,
      scheduled_date: result.scheduled_date,
      state: card.state,
    } as any);
  if (logError) throw logError;

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
    .select('reviewed_at')
    .eq('user_id', userId)
    .gte('reviewed_at', thirtyDaysAgo.toISOString())
    .order('reviewed_at', { ascending: false });

  if (!logs || logs.length === 0) {
    return { lastStudyDate: null, streak: 0, energy, dailyEnergyEarned, mascotState: 'sleeping', todayCards, avgMinutesPerDay7d: 0, todayMinutes: 0 };
  }

  const lastStudyDate = new Date(logs[0].reviewed_at);
  const streak = calculateStreak(logs.map(l => l.reviewed_at));
  const mascotState = getMascotState(lastStudyDate);

  const accountCreated = p?.created_at ? new Date(p.created_at) : new Date();
  const daysSinceCreation = Math.max(1, Math.ceil((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)));
  const activeDays = Math.min(daysSinceCreation, 7);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const last7dLogs = logs.filter(l => new Date(l.reviewed_at) >= sevenDaysAgo);
  const avgMinutesPerDay7d = Math.round((last7dLogs.length * 8) / 60 / activeDays);
  const todayMinutes = Math.round((todayCards * 8) / 60);

  return { lastStudyDate, streak, energy, dailyEnergyEarned, mascotState, todayCards, avgMinutesPerDay7d, todayMinutes };
}
