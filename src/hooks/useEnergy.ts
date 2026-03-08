import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey } from '@/hooks/useProfile';
import * as energyService from '@/services/energyService';
import type { EnergyData } from '@/types/energy';
import { useEffect, useRef } from 'react';

export type { EnergyData } from '@/types/energy';

export const useEnergy = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useProfile();
  const resetDone = useRef(false);

  // Derive energy data from cached profile
  const energyData: EnergyData | null = profileQuery.data
    ? energyService.profileToEnergyData(profileQuery.data).data
    : null;

  // Handle daily reset if needed (once per mount)
  useEffect(() => {
    if (!user || !profileQuery.data || resetDone.current) return;
    const { needsReset } = energyService.profileToEnergyData(profileQuery.data);
    if (needsReset) {
      resetDone.current = true;
      energyService.performDailyReset(user.id).then(() => {
        queryClient.invalidateQueries({ queryKey: profileQueryKey(user.id) });
      });
    }
  }, [user, profileQuery.data]);

  const addSuccessfulCard = useMutation({
    mutationFn: async ({ flowMultiplier }: { flowMultiplier: number }) => {
      if (!user) throw new Error('Not authenticated');
      if (!energyData) throw new Error('No energy data');
      return energyService.addSuccessfulCard(user.id, energyData, flowMultiplier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['study-stats', user?.id] });
    },
  });

  const spendEnergy = useMutation({
    mutationFn: async (amount: number) => {
      if (!user) throw new Error('Not authenticated');
      if (!energyData) throw new Error('No energy data');
      return energyService.spendEnergy(user.id, energyData.energy, amount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileQueryKey(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['study-stats', user?.id] });
    },
  });

  return {
    energy: energyData?.energy ?? 0,
    counter: energyData?.successfulCardsCounter ?? 0,
    dailyCardsStudied: energyData?.dailyCardsStudied ?? 0,
    isLoading: profileQuery.isLoading,
    addSuccessfulCard,
    spendEnergy,
  };
};
