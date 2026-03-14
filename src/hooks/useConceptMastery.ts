/**
 * useConceptMastery — derives concept mastery from global_concepts + question_concepts.
 * Includes temporal decay (Bjork, 1994) to prevent illusion of fluency.
 * useGlobalConceptMastery — cross-deck concept aggregation (also from global_concepts).
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// Decay constants (days)
const STRONG_DECAY_DAYS = 14;
const LEARNING_DECAY_DAYS = 7;

export interface ConceptMasteryItem {
  concept: string;
  masteryLevel: 'strong' | 'learning' | 'weak';
  rawMasteryLevel: 'strong' | 'learning' | 'weak';
  correctCount: number;
  wrongCount: number;
  questionCount: number;
  totalAttempts: number;
  accuracy: number;
  daysSinceUpdate: number | null;
  decayed: boolean;
}

export interface ConceptMasterySummary {
  total: number;
  strong: number;
  learning: number;
  weak: number;
  weakConcepts: string[];
  weakAndLearningConcepts: string[];
}

function applyDecay(level: 'strong' | 'learning' | 'weak', daysSinceUpdate: number | null): { level: 'strong' | 'learning' | 'weak'; decayed: boolean } {
  if (daysSinceUpdate === null) return { level, decayed: false };
  if (level === 'strong' && daysSinceUpdate > STRONG_DECAY_DAYS) {
    return { level: 'learning', decayed: true };
  }
  if (level === 'learning' && daysSinceUpdate > LEARNING_DECAY_DAYS) {
    return { level: 'weak', decayed: true };
  }
  return { level, decayed: false };
}

function deriveMasteryLevel(correct: number, wrong: number): 'strong' | 'learning' | 'weak' {
  const total = correct + wrong;
  if (total === 0) return 'weak';
  const rate = correct / total;
  if (rate >= 0.75 && total >= 3) return 'strong';
  if (rate >= 0.5) return 'learning';
  return 'weak';
}

export const useConceptMastery = (deckId: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['concept-mastery-dashboard', deckId, user?.id],
    queryFn: async () => {
      if (!user) return { concepts: [] as ConceptMasteryItem[], summary: { total: 0, strong: 0, learning: 0, weak: 0, weakConcepts: [], weakAndLearningConcepts: [] } as ConceptMasterySummary };

      // 1. Get question IDs for this deck
      const { data: questions } = await supabase
        .from('deck_questions' as any)
        .select('id, concepts')
        .eq('deck_id', deckId);

      if (!questions || questions.length === 0) return { concepts: [], summary: { total: 0, strong: 0, learning: 0, weak: 0, weakConcepts: [], weakAndLearningConcepts: [] } };

      const qIds = (questions as any[]).map(q => q.id);

      // 2. Get concept IDs linked via question_concepts
      const allConceptIds: string[] = [];
      for (let i = 0; i < qIds.length; i += 100) {
        const batch = qIds.slice(i, i + 100);
        const { data: links } = await supabase
          .from('question_concepts' as any)
          .select('concept_id')
          .in('question_id', batch);
        if (links) allConceptIds.push(...(links as any[]).map(l => l.concept_id));
      }

      const uniqueIds = [...new Set(allConceptIds)];
      if (uniqueIds.length === 0) {
        // Fallback: count concepts from text array
        const conceptQuestionCount = new Map<string, number>();
        for (const q of (questions as any[])) {
          for (const c of (Array.isArray(q.concepts) ? q.concepts : [])) {
            if (typeof c === 'string' && c.trim()) conceptQuestionCount.set(c.trim(), (conceptQuestionCount.get(c.trim()) ?? 0) + 1);
          }
        }
        const concepts: ConceptMasteryItem[] = Array.from(conceptQuestionCount.entries()).map(([name, qCount]) => ({
          concept: name, masteryLevel: 'weak' as const, rawMasteryLevel: 'weak' as const,
          correctCount: 0, wrongCount: 0, questionCount: qCount, totalAttempts: 0, accuracy: 0,
          daysSinceUpdate: null, decayed: false,
        }));
        return { concepts, summary: { total: concepts.length, strong: 0, learning: 0, weak: concepts.length, weakConcepts: concepts.map(c => c.concept), weakAndLearningConcepts: concepts.map(c => c.concept) } };
      }

      // 3. Fetch global_concepts for this user
      const { data: gc } = await supabase
        .from('global_concepts' as any)
        .select('id, name, correct_count, wrong_count, updated_at, state')
        .eq('user_id', user.id)
        .in('id', uniqueIds);

      const now = new Date();
      const concepts: ConceptMasteryItem[] = ((gc ?? []) as any[]).map(row => {
        const correctCount = row.correct_count ?? 0;
        const wrongCount = row.wrong_count ?? 0;
        const totalAttempts = correctCount + wrongCount;
        const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
        const rawLevel = deriveMasteryLevel(correctCount, wrongCount);
        const daysSinceUpdate = row.updated_at ? (now.getTime() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24) : null;
        const { level: decayedLevel, decayed } = applyDecay(rawLevel, daysSinceUpdate);

        return {
          concept: row.name,
          masteryLevel: decayedLevel,
          rawMasteryLevel: rawLevel,
          correctCount, wrongCount,
          questionCount: 0,
          totalAttempts, accuracy,
          daysSinceUpdate: daysSinceUpdate !== null ? Math.floor(daysSinceUpdate) : null,
          decayed,
        };
      }).sort((a, b) => {
        const order = { weak: 0, learning: 1, strong: 2 };
        return order[a.masteryLevel] - order[b.masteryLevel];
      });

      const summary: ConceptMasterySummary = {
        total: concepts.length,
        strong: concepts.filter(c => c.masteryLevel === 'strong').length,
        learning: concepts.filter(c => c.masteryLevel === 'learning').length,
        weak: concepts.filter(c => c.masteryLevel === 'weak').length,
        weakConcepts: concepts.filter(c => c.masteryLevel === 'weak').map(c => c.concept),
        weakAndLearningConcepts: concepts.filter(c => c.masteryLevel !== 'strong').map(c => c.concept),
      };

      return { concepts, summary };
    },
    enabled: !!user && !!deckId,
    staleTime: 30_000,
  });

  return {
    concepts: query.data?.concepts ?? [],
    summary: query.data?.summary ?? { total: 0, strong: 0, learning: 0, weak: 0, weakConcepts: [], weakAndLearningConcepts: [] },
    isLoading: query.isLoading,
  };
};

// ─── Cross-deck global concept mastery ─────────────────────
export interface GlobalConceptItem {
  concept: string;
  masteryLevel: 'strong' | 'learning' | 'weak';
  totalCorrect: number;
  totalWrong: number;
  deckCount: number;
  accuracy: number;
  decayed: boolean;
}

export const useGlobalConceptMastery = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['global-concept-mastery', user?.id],
    queryFn: async () => {
      if (!user) return [] as GlobalConceptItem[];

      const { data } = await supabase
        .from('global_concepts' as any)
        .select('name, correct_count, wrong_count, updated_at')
        .eq('user_id', user.id);

      if (!data || data.length === 0) return [] as GlobalConceptItem[];

      const now = new Date();
      return (data as any[]).map(row => {
        const correct = row.correct_count ?? 0;
        const wrong = row.wrong_count ?? 0;
        const total = correct + wrong;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        const rawLevel = deriveMasteryLevel(correct, wrong);
        const daysSince = row.updated_at ? (now.getTime() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24) : null;
        const { level, decayed } = applyDecay(rawLevel, daysSince);

        return {
          concept: row.name,
          masteryLevel: level,
          totalCorrect: correct,
          totalWrong: wrong,
          deckCount: 1,
          accuracy,
          decayed,
        } as GlobalConceptItem;
      }).sort((a, b) => {
        const order = { weak: 0, learning: 1, strong: 2 };
        return order[a.masteryLevel] - order[b.masteryLevel];
      });
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return {
    globalConcepts: query.data ?? [],
    isLoading: query.isLoading,
  };
};
