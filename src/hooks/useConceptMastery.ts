/**
 * useConceptMastery — derives concept mastery from deck_concept_mastery + deck_questions.
 * Includes temporal decay (Bjork, 1994) to prevent illusion of fluency.
 * useGlobalConceptMastery — cross-deck concept aggregation.
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
  rawMasteryLevel: 'strong' | 'learning' | 'weak'; // before decay
  correctCount: number;
  wrongCount: number;
  questionCount: number;
  totalAttempts: number;
  accuracy: number; // 0-100
  daysSinceUpdate: number | null;
  decayed: boolean; // true if mastery was lowered by decay
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

export const useConceptMastery = (deckId: string) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['concept-mastery-dashboard', deckId, user?.id],
    queryFn: async () => {
      if (!user) return { concepts: [] as ConceptMasteryItem[], summary: { total: 0, strong: 0, learning: 0, weak: 0, weakConcepts: [], weakAndLearningConcepts: [] } as ConceptMasterySummary };

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
      const now = new Date();

      const concepts: ConceptMasteryItem[] = Array.from(allConceptKeys).map(key => {
        const mastery = masteryMap.get(key);
        const questionCount = conceptQuestionCount.get(key) ?? 0;
        const correctCount = mastery?.correct_count ?? 0;
        const wrongCount = mastery?.wrong_count ?? 0;
        const totalAttempts = correctCount + wrongCount;
        const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

        // Raw mastery level from DB
        let rawLevel: 'strong' | 'learning' | 'weak' = 'weak';
        if (mastery?.mastery_level === 'strong') rawLevel = 'strong';
        else if (mastery?.mastery_level === 'learning') rawLevel = 'learning';

        // Calculate days since last update
        const daysSinceUpdate = mastery?.updated_at
          ? (now.getTime() - new Date(mastery.updated_at).getTime()) / (1000 * 60 * 60 * 24)
          : null;

        // Apply temporal decay (UI-only)
        const { level: decayedLevel, decayed } = applyDecay(rawLevel, daysSinceUpdate);

        const displayName = mastery?.concept ?? key;

        return {
          concept: displayName,
          masteryLevel: decayedLevel,
          rawMasteryLevel: rawLevel,
          correctCount,
          wrongCount,
          questionCount,
          totalAttempts,
          accuracy,
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

      const { data: allMastery } = await supabase
        .from('deck_concept_mastery' as any)
        .select('concept, correct_count, wrong_count, mastery_level, updated_at, deck_id')
        .eq('user_id', user.id);

      if (!allMastery || allMastery.length === 0) return [] as GlobalConceptItem[];

      // Aggregate by concept name (case-insensitive)
      const conceptMap = new Map<string, { displayName: string; correct: number; wrong: number; deckIds: Set<string>; latestUpdate: Date }>();
      const now = new Date();

      for (const row of allMastery as any[]) {
        const key = (row.concept as string).trim().toLocaleLowerCase('pt-BR');
        const existing = conceptMap.get(key);
        const updateDate = new Date(row.updated_at);

        if (existing) {
          existing.correct += row.correct_count ?? 0;
          existing.wrong += row.wrong_count ?? 0;
          existing.deckIds.add(row.deck_id);
          if (updateDate > existing.latestUpdate) {
            existing.latestUpdate = updateDate;
            existing.displayName = row.concept;
          }
        } else {
          conceptMap.set(key, {
            displayName: row.concept,
            correct: row.correct_count ?? 0,
            wrong: row.wrong_count ?? 0,
            deckIds: new Set([row.deck_id]),
            latestUpdate: updateDate,
          });
        }
      }

      return Array.from(conceptMap.entries()).map(([, data]) => {
        const total = data.correct + data.wrong;
        const accuracy = total > 0 ? Math.round((data.correct / total) * 100) : 0;
        const rate = total > 0 ? data.correct / total : 0;
        let rawLevel: 'strong' | 'learning' | 'weak' = rate >= 0.75 && total >= 3 ? 'strong' : rate >= 0.5 ? 'learning' : 'weak';

        const daysSince = (now.getTime() - data.latestUpdate.getTime()) / (1000 * 60 * 60 * 24);
        const { level, decayed } = applyDecay(rawLevel, daysSince);

        return {
          concept: data.displayName,
          masteryLevel: level,
          totalCorrect: data.correct,
          totalWrong: data.wrong,
          deckCount: data.deckIds.size,
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
