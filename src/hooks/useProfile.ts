/**
 * Centralized profile hook with 5-minute staleTime.
 * Shared across useEnergy, useStudyStats, useDashboardState, useStudyPlan, etc.
 * Eliminates redundant profile fetches (~5 per page load → 1).
 *
 * All Supabase access lives in `services/profileService` — this hook only owns
 * caching and the singleton Realtime subscription lifecycle.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchProfile, subscribeToProfileRow, type ProfileData } from '@/services/profileService';
import type { QueryClient as ReactQueryClient } from '@tanstack/react-query';

export type { ProfileData };

export const profileQueryKey = (userId?: string) => ['profile', userId];

let unsubscribeProfile: (() => void) | null = null;
let subscribedUserId: string | null = null;
let profileSubscriberCount = 0;

/**
 * Singleton channel: Supabase rejects adding postgres_changes callbacks to an
 * already-subscribed channel, so every consumer shares one subscription.
 */
const subscribeToProfile = (userId: string, queryClient: ReactQueryClient) => {
  profileSubscriberCount += 1;

  if (!unsubscribeProfile || subscribedUserId !== userId) {
    unsubscribeProfile?.();
    subscribedUserId = userId;
    unsubscribeProfile = subscribeToProfileRow(userId, (newRow) => {
      queryClient.setQueryData(profileQueryKey(userId), (old: ProfileData | undefined) =>
        old ? { ...old, ...newRow } : old
      );
    });
  }

  return () => {
    profileSubscriberCount = Math.max(0, profileSubscriberCount - 1);
    if (profileSubscriberCount !== 0 || !unsubscribeProfile) return;
    const teardown = unsubscribeProfile;
    unsubscribeProfile = null;
    subscribedUserId = null;
    teardown();
  };
};

export const useProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery<ProfileData>({
    queryKey: profileQueryKey(userId),
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Realtime subscription: auto-update cache when profile changes server-side
  useEffect(() => {
    if (!userId) return;
    return subscribeToProfile(userId, queryClient);
  }, [userId, queryClient]);

  return query;
};

/** Prefetch profile data — call once after auth to warm the cache. */
export const prefetchProfile = async (userId: string, queryClient: QueryClient) => {
  await queryClient.prefetchQuery({
    queryKey: profileQueryKey(userId),
    queryFn: () => fetchProfile(userId),
    staleTime: 5 * 60_000,
  });
};

/** Invalidate profile cache — call after mutations that touch profile fields. */
export const useInvalidateProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: profileQueryKey(user.id) });
    }
  };
};
