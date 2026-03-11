import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as turmaService from '@/services/turmaService';
import type { Turma, TurmaMemberWithStats } from '@/types/turma';

export type { Turma, TurmaMemberWithStats } from '@/types/turma';

export const useTurmas = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const turmasQuery = useQuery({
    queryKey: ['turmas', user?.id],
    queryFn: () => turmaService.fetchUserTurmas(user!.id),
    enabled: !!user,
  });

  const createTurma = useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.createTurma(user.id, name, description);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turmas'] }),
  });

  const joinTurma = useMutation({
    mutationFn: (inviteCode: string) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.joinTurmaByCode(user.id, inviteCode);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turmas'] }),
  });

  const joinTurmaById = useMutation({
    mutationFn: (turmaId: string) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.joinTurmaById(user.id, turmaId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turmas'] });
      queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
    },
  });

  const leaveTurma = useMutation({
    mutationFn: (turmaId: string) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.leaveTurma(turmaId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turmas'] }),
  });

  const updateTurma = useMutation({
    mutationFn: ({ turmaId, ...updates }: { turmaId: string; name?: string; description?: string; isPrivate?: boolean; coverImageUrl?: string; subscriptionPrice?: number; shareSlug?: string }) => {
      if (!user) throw new Error('Not authenticated');
      return turmaService.updateTurma(turmaId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turmas'] });
      queryClient.invalidateQueries({ queryKey: ['discover-turmas'] });
    },
  });

  return { turmas: turmasQuery.data ?? [], isLoading: turmasQuery.isLoading, createTurma, joinTurma, joinTurmaById, leaveTurma, updateTurma };
};

export const useDiscoverTurmas = (searchQuery: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['discover-turmas', searchQuery],
    queryFn: () => turmaService.fetchDiscoverTurmas(user!.id, searchQuery),
    enabled: !!user,
    staleTime: 30_000,
  });
};

export const useTurmaRanking = (turmaId: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['turma-ranking', turmaId],
    queryFn: () => turmaService.fetchTurmaRanking(turmaId),
    enabled: !!user && !!turmaId,
    staleTime: 60_000,
  });
};

export const usePublicDecks = (searchQuery: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['public-decks', searchQuery],
    queryFn: () => turmaService.fetchPublicDecks(searchQuery),
    enabled: !!user,
    staleTime: 30_000,
  });
};
