/**
 * useUnifiedQueue — Computes a unified study summary merging cards + due concepts.
 * Returns aggregate counts, time estimate, and the best navigation target.
 */
import { useMemo } from 'react';
import { useDecks } from '@/hooks/useDecks';
import { useStudyPlan } from '@/hooks/useStudyPlan';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import { useProfile } from '@/hooks/useProfile';
import { calculateRealStudyTime, DEFAULT_STUDY_METRICS } from '@/lib/studyUtils';
import type { DeckWithStats } from '@/types/deck';

/** Max session recommendation in minutes */
const SESSION_CAP_MINUTES = 30;

function collectDescendants(decks: DeckWithStats[], parentId: string): DeckWithStats[] {
  const children = decks.filter(d => d.parent_deck_id === parentId && !d.is_archived);
  return children.flatMap(c => [c, ...collectDescendants(decks, c.id)]);
}

function aggregateStats(deck: DeckWithStats, allDecks: DeckWithStats[]) {
  const descendants = collectDescendants(allDecks, deck.id);
  const all = [deck, ...descendants];
  let newCount = 0, learning = 0, review = 0, newReviewed = 0, reviewed = 0, newGraduated = 0;
  for (const d of all) {
    newCount += d.new_count;
    learning += d.learning_count;
    review += d.review_count;
    newReviewed += d.new_reviewed_today ?? 0;
    reviewed += d.reviewed_today ?? 0;
    newGraduated += d.new_graduated_today ?? 0;
  }
  return { newCount, learning, review, newReviewed, reviewed, newGraduated };
}

export interface UnifiedQueueSummary {
  newCards: number;
  learningCards: number;
  reviewCards: number;
  dueThemes: number;
  totalItems: number;
  studiedToday: number;
  estimatedMinutes: number;
  /** Capped session recommendation */
  sessionMinutes: number;
  sessionCards: number;
  isCapped: boolean;
  /** Best deck to navigate to for study */
  firstPendingDeckId: string | null;
  isLoading: boolean;
  hasUnreviewedConcepts: boolean;
  unreviewedConceptCount: number;
}

export function useUnifiedQueue(): UnifiedQueueSummary {
  const { decks: allDecks, isLoading: decksLoading } = useDecks();
  const { plans, allDeckIds, realStudyMetrics } = useStudyPlan();
  const { dueConcepts, concepts, isLoading: conceptsLoading } = useGlobalConcepts();
  const { data: profile } = useProfile();

  const metrics = realStudyMetrics ?? DEFAULT_STUDY_METRICS;

  return useMemo(() => {
    if (!allDecks || decksLoading) {
      return {
        newCards: 0, learningCards: 0, reviewCards: 0, dueThemes: 0,
        totalItems: 0, studiedToday: 0, estimatedMinutes: 0,
        sessionMinutes: 0, sessionCards: 0, isCapped: false,
        firstPendingDeckId: null, isLoading: true,
        hasUnreviewedConcepts: false, unreviewedConceptCount: 0,
      };
    }

    const hasPlan = plans.length > 0;
    const roots = allDecks.filter(d => !d.is_archived && !d.parent_deck_id);

    // Determine which root decks to consider
    let scopedRoots: DeckWithStats[];
    if (hasPlan && allDeckIds.length > 0) {
      const getRootId = (id: string): string | null => {
        const d = allDecks.find(x => x.id === id);
        if (!d) return null;
        return d.parent_deck_id ? getRootId(d.parent_deck_id) : d.id;
      };
      const rootIds = new Set<string>();
      for (const id of allDeckIds) {
        const rid = getRootId(id);
        if (rid) rootIds.add(rid);
      }
      scopedRoots = roots.filter(d => rootIds.has(d.id));
    } else {
      scopedRoots = roots;
    }

    // Global new limit
    const rawGlobalNewLimit = profile?.daily_new_cards_limit ?? 9999;
    const weeklyNew = profile?.weekly_new_cards as Record<string, number> | null;
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const todayGlobalLimit = weeklyNew?.[DAY_KEYS[new Date().getDay()]] ?? rawGlobalNewLimit;

    let totalNew = 0, totalLearning = 0, totalReview = 0, totalStudied = 0;
    let globalNewReviewed = 0;
    let firstPendingDeckId: string | null = null;

    for (const root of scopedRoots) {
      const agg = aggregateStats(root, allDecks);
      totalLearning += agg.learning;
      totalReview += Math.max(0, Math.min(agg.review, (root.daily_review_limit ?? 100) - Math.max(0, agg.reviewed - agg.newGraduated)));
      totalStudied += agg.reviewed;
      globalNewReviewed += agg.newReviewed;

      if (!hasPlan) {
        const deckNewLimit = root.daily_new_limit ?? 20;
        totalNew += Math.max(0, Math.min(agg.newCount, deckNewLimit - agg.newReviewed));
      }
    }

    if (hasPlan) {
      const globalRemaining = Math.max(0, todayGlobalLimit - globalNewReviewed);
      // Sum available new across all roots, capped by global remaining
      let rawNew = 0;
      for (const root of scopedRoots) {
        const agg = aggregateStats(root, allDecks);
        rawNew += agg.newCount;
      }
      totalNew = Math.min(rawNew, globalRemaining);
    }

    const dueThemes = dueConcepts.length;
    const totalPending = totalNew + totalLearning + totalReview;
    const totalItems = totalPending + dueThemes;

    // Find first deck with pending cards
    for (const root of scopedRoots) {
      const agg = aggregateStats(root, allDecks);
      if (agg.learning > 0 || agg.review > 0 || agg.newCount > 0) {
        firstPendingDeckId = root.id;
        break;
      }
    }

    // Time estimate
    const estimatedSeconds = calculateRealStudyTime(totalNew, totalLearning, totalReview, metrics);
    const estimatedMinutes = Math.round(estimatedSeconds / 60);

    // Session cap
    const isCapped = estimatedMinutes > SESSION_CAP_MINUTES;
    const sessionMinutes = isCapped ? SESSION_CAP_MINUTES : estimatedMinutes;
    const ratio = isCapped ? SESSION_CAP_MINUTES / estimatedMinutes : 1;
    const sessionCards = isCapped ? Math.round(totalPending * ratio) : totalPending;

    // Unreviewed concepts for diagnostic
    const unreviewedConceptCount = concepts.filter(c => !c.last_reviewed_at && c.state === 0).length;

    return {
      newCards: totalNew,
      learningCards: totalLearning,
      reviewCards: totalReview,
      dueThemes,
      totalItems,
      studiedToday: totalStudied,
      estimatedMinutes,
      sessionMinutes,
      sessionCards,
      isCapped,
      firstPendingDeckId,
      isLoading: decksLoading || conceptsLoading,
      hasUnreviewedConcepts: unreviewedConceptCount >= 10,
      unreviewedConceptCount,
    };
  }, [allDecks, decksLoading, plans, allDeckIds, dueConcepts, concepts, conceptsLoading, profile, metrics]);
}
