/**
 * useGlobalSearch — debounced FTS hook.
 * Calls searchService and groups results by type.
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchUserContent } from '@/services/searchService';
import type { SearchResult } from '@/types/search';

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

  const grouped = useMemo(() => {
    if (!data) return { decks: [], cards: [] };
    return {
      decks: data.filter(r => r.result_type === 'deck'),
      cards: data.filter(r => r.result_type === 'card'),
    };
  }, [data]);

  return {
    results: data ?? [],
    decks: grouped.decks,
    cards: grouped.cards,
    isLoading: isLoading && debouncedQuery.length >= 2,
    error,
    hasQuery: debouncedQuery.length >= 2,
  };
}
