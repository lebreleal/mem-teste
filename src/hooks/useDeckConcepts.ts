import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as conceptService from '@/services/conceptService';

export type { ConceptRow } from '@/services/conceptService';

export const useDeckConcepts = (deckId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const conceptsQuery = useQuery({
    queryKey: ['deck-concepts', deckId],
    queryFn: () => conceptService.fetchConcepts(deckId, user!.id),
    enabled: !!user && !!deckId,
    staleTime: 60_000,
  });

  const createConcept = useMutation({
    mutationFn: ({ name, cardIds }: { name: string; cardIds?: string[] }) =>
      conceptService.createConcept(deckId, user!.id, name, cardIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck-concepts', deckId] }),
  });

  const renameConcept = useMutation({
    mutationFn: ({ conceptId, newName }: { conceptId: string; newName: string }) =>
      conceptService.renameConcept(conceptId, newName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck-concepts', deckId] }),
  });

  const deleteConcept = useMutation({
    mutationFn: (conceptId: string) => conceptService.deleteConcept(conceptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck-concepts', deckId] }),
  });

  const updateConceptCards = useMutation({
    mutationFn: ({ conceptId, cardIds }: { conceptId: string; cardIds: string[] }) =>
      conceptService.updateConceptCards(conceptId, cardIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck-concepts', deckId] }),
  });

  return {
    concepts: conceptsQuery.data ?? [],
    isLoading: conceptsQuery.isLoading,
    createConcept,
    renameConcept,
    deleteConcept,
    updateConceptCards,
  };
};

export const useConceptCards = (conceptId: string | null) => {
  return useQuery({
    queryKey: ['concept-cards', conceptId],
    queryFn: () => conceptService.fetchConceptCards(conceptId!),
    enabled: !!conceptId,
    staleTime: 60_000,
  });
};
