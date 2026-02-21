import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as turmaService from '@/services/turmaService';

export const useMyTurmaRating = (turmaId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const ratingQuery = useQuery({
    queryKey: ['my-turma-rating', turmaId, user?.id],
    queryFn: () => turmaService.fetchMyTurmaRating(turmaId, user!.id),
    enabled: !!user && !!turmaId,
  });

  const submitRating = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment?: string }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.submitTurmaRating(turmaId, user.id, rating, comment, ratingQuery.data?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-turma-rating', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turmas'] });
      queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
      queryClient.invalidateQueries({ queryKey: ['all-turma-ratings', turmaId] });
    },
  });

  return { myRating: ratingQuery.data, submitRating };
};

export const useAllTurmaRatings = (turmaId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ['all-turma-ratings', turmaId],
    queryFn: () => turmaService.fetchAllTurmaRatings(turmaId),
    enabled: enabled && !!turmaId,
  });
};
