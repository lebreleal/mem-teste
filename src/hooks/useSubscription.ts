/**
 * Hook to check Stripe subscription status and manage premium state.
 * Replaces the old usePremium that only checked profiles.premium_expires_at.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCallback } from 'react';

export interface SubscriptionStatus {
  subscribed: boolean;
  plan?: 'monthly' | 'annual' | 'lifetime';
  subscription_end?: string;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<SubscriptionStatus>({
    queryKey: ['subscription-status', user?.id],
    queryFn: async () => {
      if (!user) return { subscribed: false };
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        console.error('check-subscription error:', error);
        // Fallback to profile-based check
        const { data: profile } = await supabase
          .from('profiles')
          .select('premium_expires_at')
          .eq('id', user.id)
          .single();
        const expiresAt = (profile as any)?.premium_expires_at as string | null;
        const isPremium = !!expiresAt && new Date(expiresAt) > new Date();
        return { subscribed: isPremium, subscription_end: expiresAt ?? undefined };
      }
      return data as SubscriptionStatus;
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const isPremium = data?.subscribed ?? false;
  const plan = data?.plan;
  const expiresAt = data?.subscription_end ?? null;

  const startCheckout = useCallback(async (priceId: string, mode: 'subscription' | 'payment') => {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { price_id: priceId, mode },
    });
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  }, []);

  const openPortal = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('customer-portal');
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  }, []);

  const refreshStatus = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['energy', user?.id] });
  }, [refetch, queryClient, user?.id]);

  return {
    isPremium,
    plan,
    expiresAt,
    isLoading,
    startCheckout,
    openPortal,
    refreshStatus,
  };
}
