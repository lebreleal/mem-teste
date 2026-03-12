/**
 * useConceptMastery — derives concept mastery from deck_concept_mastery + deck_questions.
 * Replaces useDeckConcepts (FSRS-based) with a performance-based dashboard.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface ConceptMasteryItem {
  concept: string;
  masteryLevel: 'strong' | 'learning' | 'weak';
  correctCount: number;
  wrongCount: number;
  questionCount: number;
  totalAttempts: number;
  accuracy: number; // 0-100
}

export interface ConceptMasterySummary {
  total: number;
  strong: number;
  learning: number;
  weak: number;
  weakConcepts: string[];
}

export const useConceptMastery = (deckId: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['concept-mastery-dashboard', deckId, user?.id],
    queryFn: async () => {
      if (!user) return { concepts: [] as ConceptMasteryItem[], summary: { total: 0, strong: 0, learning: 0, weak: 0, weakConcepts: [] } as ConceptMasterySummary };

      // 1. Get all unique concepts from deck_questions
      const { data: questions } = await supabase
        .from('deck_questions' as any)
        .select('concepts')
        .eq('deck_id', deckId);

      const conceptQuestionCount = new Map<string, number>();
      for (const q of (questions ?? []) as any[]) {
        const concepts = Array.isArray(q.concepts) ? q.concepts : [];
        for (const c of concepts) {
          if (typeof c === 'string' && c.trim()) {
            const normalized = c.trim();
            const key = normalized.toLocaleLowerCase('pt-BR');
            conceptQuestionCount.set(key, (conceptQuestionCount.get(key) ?? 0) + 1);
          }
        }
      }

      // 2. Get mastery data from deck_concept_mastery
      const { data: masteryRows } = await supabase
        .from('deck_concept_mastery' as any)
        .select('*')
        .eq('deck_id', deckId)
        .eq('user_id', user.id);

      const masteryMap = new Map<string, any>();
      for (const row of (masteryRows ?? []) as any[]) {
        const key = (row.concept as string).trim().toLocaleLowerCase('pt-BR');
        masteryMap.set(key, row);
      }

      // 3. Merge: all concepts from questions + any mastery data
      const allConceptKeys = new Set([...conceptQuestionCount.keys(), ...masteryMap.keys()]);

      const concepts: ConceptMasteryItem[] = Array.from(allConceptKeys).map(key => {
        const mastery = masteryMap.get(key);
        const questionCount = conceptQuestionCount.get(key) ?? 0;
        const correctCount = mastery?.correct_count ?? 0;
        const wrongCount = mastery?.wrong_count ?? 0;
        const totalAttempts = correctCount + wrongCount;
        const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

        // Determine mastery level
        let masteryLevel: 'strong' | 'learning' | 'weak' = 'weak';
        if (mastery?.mastery_level === 'strong') masteryLevel = 'strong';
        else if (mastery?.mastery_level === 'learning') masteryLevel = 'learning';
        else if (totalAttempts === 0) masteryLevel = 'weak';

        // Use the display name from mastery or reconstruct from questions
        const displayName = mastery?.concept ?? key;

        return {
          concept: displayName,
          masteryLevel,
          correctCount,
          wrongCount,
          questionCount,
          totalAttempts,
          accuracy,
        };
      }).sort((a, b) => {
        // Sort: weak first, then learning, then strong
        const order = { weak: 0, learning: 1, strong: 2 };
        return order[a.masteryLevel] - order[b.masteryLevel];
      });

      const summary: ConceptMasterySummary = {
        total: concepts.length,
        strong: concepts.filter(c => c.masteryLevel === 'strong').length,
        learning: concepts.filter(c => c.masteryLevel === 'learning').length,
        weak: concepts.filter(c => c.masteryLevel === 'weak').length,
        weakConcepts: concepts.filter(c => c.masteryLevel === 'weak').map(c => c.concept),
      };

      return { concepts, summary };
    },
    enabled: !!user && !!deckId,
    staleTime: 30_000,
  });

  return {
    concepts: query.data?.concepts ?? [],
    summary: query.data?.summary ?? { total: 0, strong: 0, learning: 0, weak: 0, weakConcepts: [] },
    isLoading: query.isLoading,
  };
};
