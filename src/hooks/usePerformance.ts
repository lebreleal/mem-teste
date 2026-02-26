import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { calculateCardRecall } from '@/components/RetentionGauge';
import type { CardTypeBreakdown, SubjectRetention, PerformanceData } from '@/types/performance';

export type { CardTypeBreakdown, SubjectRetention, PerformanceData } from '@/types/performance';

export const usePerformance = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-performance', user?.id],
    queryFn: async (): Promise<PerformanceData> => {
      if (!user) return { subjects: [], totalPendingReviews: 0, totalNewCards: 0, upcomingExams: [] };

      // NOTE: This hook still uses direct Supabase calls because the performance
      // calculation is highly specific, cross-cuts multiple domains (decks, cards,
      // review_logs), and uses component-level utilities (calculateCardRecall).
      // Moving this to a service would require passing the recall function or
      // duplicating its logic. This is acceptable as a read-only aggregation query.

      const { data: allDecks } = await supabase
        .from('decks')
        .select('id, name, parent_deck_id, folder_id, source_listing_id, algorithm_mode, daily_new_limit, daily_review_limit')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      if (!allDecks || allDecks.length === 0) {
        return { subjects: [], totalPendingReviews: 0, totalNewCards: 0, upcomingExams: [] };
      }

      const deckMap = new Map(allDecks.map(d => [d.id, d]));
      const allDeckEntries = allDecks.map(d => ({ rootId: d.id, deckIds: [d.id] }));
      const allDeckIds = allDecks.map(d => d.id);

      const { data: cards } = await supabase
        .from('cards')
        .select('id, deck_id, state, scheduled_date, stability, difficulty, card_type, last_reviewed_at')
        .in('deck_id', allDeckIds);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const cardIds = (cards ?? []).map(c => c.id);
      let reviewLogs: any[] = [];
      if (cardIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < cardIds.length; i += chunkSize) {
          const chunk = cardIds.slice(i, i + chunkSize);
          const { data } = await supabase
            .from('review_logs')
            .select('card_id, reviewed_at, stability')
            .eq('user_id', user.id)
            .in('card_id', chunk)
            .gte('reviewed_at', sevenDaysAgo.toISOString());
          if (data) reviewLogs.push(...data);
        }
      }

      const now = new Date();
      let totalPendingReviews = 0;
      let totalNewCards = 0;
      const subjects: SubjectRetention[] = [];

      allDeckEntries.forEach(({ rootId, deckIds }) => {
        const rootDeck = deckMap.get(rootId);
        if (!rootDeck) return;

        const groupCards = (cards ?? []).filter(c => deckIds.includes(c.deck_id));
        if (groupCards.length === 0) return;

        let cappedNewCards = 0;
        let cappedReviewCards = 0;
        const todayCardTypes: CardTypeBreakdown = { basic: 0, cloze: 0, multiple_choice: 0, image_occlusion: 0 };

        deckIds.forEach(did => {
          const deck = deckMap.get(did);
          if (!deck) return;
          const deckCards = groupCards.filter(c => c.deck_id === did);
          const newCardsArr = deckCards.filter(c => c.state === 0);
          const reviewCardsArr = deckCards.filter(c => c.state === 2 && new Date(c.scheduled_date) <= now);
          const limitedNew = newCardsArr.slice(0, deck.daily_new_limit ?? 20);
          const limitedReview = reviewCardsArr.slice(0, deck.daily_review_limit ?? 100);
          cappedNewCards += limitedNew.length;
          cappedReviewCards += limitedReview.length;

          [...limitedNew, ...limitedReview].forEach(c => {
            const ct = (c as any).card_type || 'basic';
            if (ct in todayCardTypes) todayCardTypes[ct as keyof CardTypeBreakdown]++;
            else todayCardTypes.basic++;
          });
        });

        totalNewCards += cappedNewCards;
        totalPendingReviews += cappedReviewCards;

        const algorithmMode = rootDeck.algorithm_mode || 'fsrs';
        let totalRetention = 0;
        let cardsWithData = 0;
        let lastReviewAt: string | null = null;

        groupCards.forEach(card => {
          const recall = calculateCardRecall(card, algorithmMode);
          if (card.state !== 0) { totalRetention += recall.percent; cardsWithData++; }
          const cardLogs = reviewLogs.filter(l => l.card_id === card.id);
          cardLogs.forEach(log => {
            if (!lastReviewAt || new Date(log.reviewed_at) > new Date(lastReviewAt)) lastReviewAt = log.reviewed_at;
          });
        });

        const avgRetention = cardsWithData > 0 ? Math.round(totalRetention / cardsWithData) : 0;
        const hasRecentReviews = reviewLogs.some(l => groupCards.some(c => c.id === l.card_id));
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (hasRecentReviews && avgRetention >= 70) trend = 'up';
        else if (avgRetention < 50 && cardsWithData > 0) trend = 'down';

        subjects.push({ subjectId: rootId, subjectName: rootDeck.name, avgRetention, totalCards: groupCards.length, reviewCards: cappedReviewCards, newCards: cappedNewCards, lastReviewAt, trend, deckIds, todayCardTypes });
      });

      subjects.sort((a, b) => a.avgRetention - b.avgRetention);
      return { subjects, totalPendingReviews, totalNewCards, upcomingExams: [] };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};
