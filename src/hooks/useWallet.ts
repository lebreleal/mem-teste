import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as walletService from '@/services/walletService';
import type { WalletData, CreatorTierData } from '@/types/wallet';

export type { WalletData, WalletTransaction, CreatorTierData } from '@/types/wallet';

export const useWallet = () => {
  const { user } = useAuth();
  return useQuery<WalletData>({
    queryKey: ['wallet', user?.id],
    queryFn: () => walletService.fetchWallet(user!.id),
    enabled: !!user,
  });
};

export const useCreatorTier = () => {
  const { user } = useAuth();
  return useQuery<CreatorTierData>({
    queryKey: ['creator-tier', user?.id],
    queryFn: () => walletService.fetchCreatorTier(user!.id),
    enabled: !!user,
  });
};
