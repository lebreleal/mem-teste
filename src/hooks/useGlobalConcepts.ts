/**
 * useGlobalConcepts — hook for global concept FSRS study.
 * Provides: all concepts, due concepts, review mutation.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as globalConceptService from '@/services/globalConceptService';
import type { GlobalConcept } from '@/services/globalConceptService';
import { fsrsSchedule, DEFAULT_FSRS_PARAMS, type FSRSCard, type Rating } from '@/lib/fsrs';

export type { GlobalConcept } from '@/services/globalConceptService';

export const useGlobalConcepts = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const allQuery = useQuery({
    queryKey: ['global-concepts', user?.id],
    queryFn: () => globalConceptService.fetchGlobalConcepts(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  const dueQuery = useQuery({
    queryKey: ['global-concepts-due', user?.id],
    queryFn: () => globalConceptService.fetchDueConcepts(user!.id),
    enabled: !!user,
    staleTime: 10_000,
  });

  const submitConceptReview = useMutation({
    mutationFn: async ({ concept, rating, isCorrect }: { concept: GlobalConcept; rating: Rating; isCorrect: boolean }) => {
      // Apply FSRS to the concept
      const card: FSRSCard = {
        stability: concept.stability,
        difficulty: concept.difficulty,
        state: concept.state,
        scheduled_date: concept.scheduled_date,
        learning_step: concept.learning_step,
        last_reviewed_at: concept.last_reviewed_at ?? undefined,
      };

      const result = fsrsSchedule(card, rating, {
        ...DEFAULT_FSRS_PARAMS,
        learningSteps: [10, 1440],
        relearningSteps: [10],
      });

      // Update FSRS fields
      await globalConceptService.updateConceptFsrs(concept.id, {
        state: result.state,
        stability: result.stability,
        difficulty: result.difficulty,
        scheduled_date: result.scheduled_date,
        learning_step: result.learning_step,
        last_reviewed_at: new Date().toISOString(),
      });

      // Update mastery counts
      await globalConceptService.updateConceptMastery(concept.id, isCorrect);

      return result;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      queryClient.invalidateQueries({ queryKey: ['global-concepts-due'] });
    },
  });

  const getVariedQuestion = async (conceptId: string) => {
    if (!user) return null;
    return globalConceptService.getVariedQuestion(conceptId, user.id);
  };

  const updateMeta = useMutation({
    mutationFn: ({ conceptId, fields }: { conceptId: string; fields: { name?: string; category?: string | null; subcategory?: string | null } }) =>
      globalConceptService.updateConceptMeta(conceptId, fields),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
    },
  });

  const deleteConcept = useMutation({
    mutationFn: (conceptId: string) => globalConceptService.deleteConcept(conceptId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      queryClient.invalidateQueries({ queryKey: ['global-concepts-due'] });
    },
  });

  const unlinkQuestion = useMutation({
    mutationFn: ({ conceptId, questionId }: { conceptId: string; questionId: string }) =>
      globalConceptService.unlinkQuestion(conceptId, questionId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
    },
  });

  return {
    concepts: allQuery.data ?? [],
    dueConcepts: dueQuery.data ?? [],
    isLoading: allQuery.isLoading,
    isDueLoading: dueQuery.isLoading,
    submitConceptReview,
    getVariedQuestion,
    updateMeta,
    deleteConcept,
    unlinkQuestion,
  };
};
