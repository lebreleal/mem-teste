/**
 * useGlobalSearch — debounced FTS hook + recent cards.
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchUserContent, getRecentCards } from '@/services/searchService';
import type { SearchResult, RecentCard } from '@/types/search';

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

interface UseGlobalSearchOptions {
  folderId?: string | null;
}

export function useGlobalSearch(query: string, options?: UseGlobalSearchOptions) {
  const debouncedQuery = useDebounce(query.trim(), 300);
  const folderId = options?.folderId;

  const { data, isLoading, error } = useQuery<SearchResult[]>({
    queryKey: ['global-search', debouncedQuery, folderId],
    queryFn: () => searchUserContent(debouncedQuery, folderId),
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    results: data ?? [],
    isLoading: isLoading && debouncedQuery.length >= 2,
    error,
    hasQuery: debouncedQuery.length >= 2,
  };
}

export function useRecentCards(options?: UseGlobalSearchOptions & { enabled?: boolean }) {
  const folderId = options?.folderId;
  const enabled = options?.enabled ?? true;

  const { data, isLoading } = useQuery<RecentCard[]>({
    queryKey: ['recent-cards', folderId],
    queryFn: () => getRecentCards(folderId),
    enabled,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    recentCards: data ?? [],
    isLoading,
  };
}
