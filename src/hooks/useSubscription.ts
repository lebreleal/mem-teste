/**
 * Hook to check Stripe subscription status and manage premium state.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCallback } from 'react';

export interface SubscriptionStatus {
  subscribed: boolean;
  plan?: 'monthly' | 'annual' | 'lifetime' | 'trial' | 'gift';
  subscription_end?: string;
  is_trial?: boolean;
  is_gift?: boolean;
  gift_description?: string;
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
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const isPremium = data?.subscribed ?? false;
  const plan = data?.plan;
  const expiresAt = data?.subscription_end ?? null;
  const isTrial = data?.is_trial ?? false;
  const isGift = data?.is_gift ?? false;
  const giftDescription = data?.gift_description;

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
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  }, [refetch, queryClient]);

  return {
    isPremium,
    plan,
    expiresAt,
    isTrial,
    isGift,
    giftDescription,
    isLoading,
    startCheckout,
    openPortal,
    refreshStatus,
  };
}
