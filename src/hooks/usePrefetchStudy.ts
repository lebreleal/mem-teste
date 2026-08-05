import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as studyService from '@/services/studyService';

/**
 * Warms the exact query `useStudySession` reads (`['study-queue', key]`).
 *
 * Building the queue is a single server RPC, but it is only fired *after*
 * `/study/:id` mounts — that round trip is the 3-4s blank screen the user
 * sees. Warming it while they are still looking at the deck screen makes the
 * session render from cache on the first frame.
 */
export function usePrefetchStudy() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const warmed = useRef<Set<string>>(new Set());

  return useCallback(
    (deckId?: string, folderId?: string) => {
      if (!user) return;
      const key = folderId ? `folder-${folderId}` : (deckId || 'all');
      if (warmed.current.has(key)) return;
      warmed.current.add(key);

      void queryClient.prefetchQuery({
        queryKey: ['study-queue', key],
        queryFn: () => studyService.fetchStudyQueue(user.id, deckId ?? '', folderId),
        staleTime: Infinity,
      });
    },
    [queryClient, user],
  );
}

/**
 * Eagerly warm a scope once the screen is idle (no user intent needed).
 * Used by the deck screens, where "Estudar" is the dominant next action.
 */
export function useWarmStudyQueue(deckId?: string, folderId?: string) {
  const prefetch = usePrefetchStudy();

  useEffect(() => {
    if (!deckId && !folderId) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const run = () => prefetch(deckId, folderId);
    const id = w.requestIdleCallback ? w.requestIdleCallback(run) : window.setTimeout(run, 300);
    return () => {
      if (w.requestIdleCallback) return;
      clearTimeout(id);
    };
  }, [deckId, folderId, prefetch]);
}
