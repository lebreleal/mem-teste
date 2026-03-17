/**
 * useCardStatistics — Fetches card-level statistics for the stats page.
 * Queries review_logs and cards to compute retention, distributions, etc.
 * Recreated after system cleanup.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface RetentionBucket {
  rate: number;
  correct: number;
  total: number;
}

export interface CardStatistics {
  trueRetention: RetentionBucket;
  youngRetention: RetentionBucket;
  matureRetention: RetentionBucket;
  cardCounts: {
    total: number;
    new: number;
    learning: number;
    relearning: number;
    young: number;
    mature: number;
    frozen: number;
  };
  buttonCounts: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
  intervalDistribution: number[];
  stabilityDistribution: number[];
  difficultyDistribution: number[];
  retrievabilityDistribution: number[];
}

const FIFTY_YEARS_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;

function computeRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.round(Math.pow(0.9, elapsedDays / stability) * 100);
}

async function fetchCardStatisticsData(userId: string): Promise<CardStatistics> {
  // Fetch cards
  const { data: cards, error: cardsErr } = await supabase
    .from('cards')
    .select('id, state, stability, difficulty, scheduled_date, last_reviewed_at, deck_id')
    .eq('deck_id', userId); // This won't work — need to join through decks

  // Actually, we need cards belonging to user's decks
  const { data: userDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId);

  const deckIds = userDecks?.map(d => d.id) ?? [];
  if (deckIds.length === 0) return emptyStats();

  // Fetch cards in batches
  const allCards: { id: string; state: number; stability: number; difficulty: number; scheduled_date: string; last_reviewed_at: string | null }[] = [];
  for (let i = 0; i < deckIds.length; i += 50) {
    const batch = deckIds.slice(i, i + 50);
    const { data } = await supabase
      .from('cards')
      .select('id, state, stability, difficulty, scheduled_date, last_reviewed_at')
      .in('deck_id', batch);
    if (data) allCards.push(...data);
  }

  // Fetch recent review logs (last 30 days) for retention
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: reviewLogs } = await supabase
    .from('review_logs')
    .select('card_id, rating, stability, state')
    .eq('user_id', userId)
    .gte('reviewed_at', thirtyDaysAgo);

  // Compute card counts
  const now = Date.now();
  let newCount = 0, learningCount = 0, relearningCount = 0, youngCount = 0, matureCount = 0, frozenCount = 0;
  const intervals: number[] = [];
  const stabilities: number[] = [];
  const difficulties: number[] = [];
  const retrievabilities: number[] = [];

  for (const card of allCards) {
    const isFrozen = new Date(card.scheduled_date).getTime() > now + FIFTY_YEARS_MS;
    if (isFrozen) { frozenCount++; continue; }

    if (card.state === 0 || card.state == null) { newCount++; continue; }
    if (card.state === 1) { learningCount++; continue; }
    if (card.state === 3) { relearningCount++; continue; }

    // state === 2 (review)
    const stabilityDays = card.stability ?? 0;
    if (stabilityDays < 21) youngCount++;
    else matureCount++;

    if (card.last_reviewed_at) {
      const elapsed = (now - new Date(card.last_reviewed_at).getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(Math.round(elapsed));
      retrievabilities.push(computeRetrievability(stabilityDays, elapsed));
    }
    stabilities.push(stabilityDays);
    difficulties.push(card.difficulty ?? 5);
  }

  // Compute retention from review logs
  const logs = reviewLogs ?? [];
  let totalReviews = 0, correctReviews = 0;
  let youngTotal = 0, youngCorrect = 0;
  let matureTotal = 0, matureCorrect = 0;
  let again = 0, hard = 0, good = 0, easy = 0;

  for (const log of logs) {
    if (log.state === 0) continue; // skip new card reviews
    totalReviews++;
    const isCorrect = log.rating >= 3;
    if (isCorrect) correctReviews++;

    const stability = log.stability ?? 0;
    if (stability < 21) { youngTotal++; if (isCorrect) youngCorrect++; }
    else { matureTotal++; if (isCorrect) matureCorrect++; }

    if (log.rating === 1) again++;
    else if (log.rating === 2) hard++;
    else if (log.rating === 3) good++;
    else if (log.rating === 4) easy++;
  }

  const makeRetention = (correct: number, total: number): RetentionBucket => ({
    rate: total > 0 ? Math.round((correct / total) * 100) : 0,
    correct,
    total,
  });

  return {
    trueRetention: makeRetention(correctReviews, totalReviews),
    youngRetention: makeRetention(youngCorrect, youngTotal),
    matureRetention: makeRetention(matureCorrect, matureTotal),
    cardCounts: {
      total: allCards.length,
      new: newCount,
      learning: learningCount,
      relearning: relearningCount,
      young: youngCount,
      mature: matureCount,
      frozen: frozenCount,
    },
    buttonCounts: { again, hard, good, easy },
    intervalDistribution: intervals,
    stabilityDistribution: stabilities,
    difficultyDistribution: difficulties,
    retrievabilityDistribution: retrievabilities,
  };
}

function emptyStats(): CardStatistics {
  return {
    trueRetention: { rate: 0, correct: 0, total: 0 },
    youngRetention: { rate: 0, correct: 0, total: 0 },
    matureRetention: { rate: 0, correct: 0, total: 0 },
    cardCounts: { total: 0, new: 0, learning: 0, relearning: 0, young: 0, mature: 0, frozen: 0 },
    buttonCounts: { again: 0, hard: 0, good: 0, easy: 0 },
    intervalDistribution: [],
    stabilityDistribution: [],
    difficultyDistribution: [],
    retrievabilityDistribution: [],
  };
}

export function useCardStatistics() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['card-statistics', user?.id],
    queryFn: () => fetchCardStatisticsData(user!.id),
    enabled: !!user,
    staleTime: 120_000,
  });
}
