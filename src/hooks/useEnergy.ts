import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as energyService from '@/services/energyService';
import type { EnergyData } from '@/types/energy';

export type { EnergyData } from '@/types/energy';

export const useEnergy = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const energyQuery = useQuery({
    queryKey: ['energy', user?.id],
    queryFn: () => energyService.fetchEnergy(user!.id),
    enabled: !!user,
    staleTime: 10_000,
  });

  const addSuccessfulCard = useMutation({
    mutationFn: async ({ flowMultiplier }: { flowMultiplier: number }) => {
      if (!user) throw new Error('Not authenticated');
      const current = energyQuery.data;
      if (!current) throw new Error('No energy data');
      return energyService.addSuccessfulCard(user.id, current, flowMultiplier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['study-stats', user?.id] });
    },
  });

  const spendEnergy = useMutation({
    mutationFn: async (amount: number) => {
      if (!user) throw new Error('Not authenticated');
      const current = energyQuery.data;
      if (!current) throw new Error('No energy data');
      return energyService.spendEnergy(user.id, current.energy, amount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['study-stats', user?.id] });
    },
  });

  return {
    energy: energyQuery.data?.energy ?? 0,
    counter: energyQuery.data?.successfulCardsCounter ?? 0,
    dailyCardsStudied: energyQuery.data?.dailyCardsStudied ?? 0,
    isLoading: energyQuery.isLoading,
    addSuccessfulCard,
    spendEnergy,
  };
};
