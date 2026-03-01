/**
 * React Query hooks for the tagging system.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as tagService from '@/services/tagService';
import type { Tag } from '@/types/tag';

const KEYS = {
  search: (q: string) => ['tags', 'search', q] as const,
  deckTags: (deckId: string) => ['tags', 'deck', deckId] as const,
  deckTagsBatch: (ids: string) => ['tags', 'deck-batch', ids] as const,
  cardTags: (cardId: string) => ['tags', 'card', cardId] as const,
  all: ['tags', 'all'] as const,
  suggestions: (key: string) => ['tags', 'suggestions', key] as const,
};

/** Search/autocomplete tags. */
export const useTagSearch = (query: string) =>
  useQuery({
    queryKey: KEYS.search(query),
    queryFn: () => tagService.searchTags(query),
    staleTime: 30_000,
    enabled: true,
  });

/** Get tags for a deck. */
export const useDeckTags = (deckId: string | undefined) =>
  useQuery({
    queryKey: KEYS.deckTags(deckId!),
    queryFn: () => tagService.getDeckTags(deckId!),
    enabled: !!deckId,
    staleTime: 60_000,
  });

/** Get tags for multiple decks (batch). */
export const useDeckTagsBatch = (deckIds: string[]) => {
  const key = deckIds.sort().join(',');
  return useQuery({
    queryKey: KEYS.deckTagsBatch(key),
    queryFn: () => tagService.getDeckTagsBatch(deckIds),
    enabled: deckIds.length > 0,
    staleTime: 60_000,
  });
};

/** Get tags for a card. */
export const useCardTags = (cardId: string | undefined) =>
  useQuery({
    queryKey: KEYS.cardTags(cardId!),
    queryFn: () => tagService.getCardTags(cardId!),
    enabled: !!cardId,
    staleTime: 60_000,
  });

/** All tags (for admin dashboard). */
export const useAllTags = () =>
  useQuery({
    queryKey: KEYS.all,
    queryFn: () => tagService.getAllTags(200),
    staleTime: 30_000,
  });

/** AI tag suggestions. */
export const useTagSuggestions = () => {
  return useMutation({
    mutationFn: tagService.suggestTags,
  });
};

/** Mutations for managing deck tags. */
export const useDeckTagMutations = (deckId: string) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const addTag = useMutation({
    mutationFn: async (tag: Tag | string) => {
      if (!user) throw new Error('Not authenticated');
      let tagObj: Tag;
      if (typeof tag === 'string') {
        tagObj = await tagService.createTag(tag, user.id);
      } else {
        tagObj = tag;
      }
      await tagService.addDeckTag(deckId, tagObj.id, user.id);
      return tagObj;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.deckTags(deckId) });
    },
  });

  const removeTag = useMutation({
    mutationFn: (tagId: string) => tagService.removeDeckTag(deckId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.deckTags(deckId) });
    },
  });

  return { addTag, removeTag };
};

/** Mutations for managing card tags. */
export const useCardTagMutations = (cardId: string) => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const addTag = useMutation({
    mutationFn: async (tag: Tag | string) => {
      if (!user) throw new Error('Not authenticated');
      let tagObj: Tag;
      if (typeof tag === 'string') {
        tagObj = await tagService.createTag(tag, user.id);
      } else {
        tagObj = tag;
      }
      await tagService.addCardTag(cardId, tagObj.id, user.id);
      return tagObj;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.cardTags(cardId) });
    },
  });

  const removeTag = useMutation({
    mutationFn: (tagId: string) => tagService.removeCardTag(cardId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.cardTags(cardId) });
    },
  });

  return { addTag, removeTag };
};

/** Admin mutations for tag management. */
export const useTagAdminMutations = () => {
  const qc = useQueryClient();

  const updateTag = useMutation({
    mutationFn: ({ id, ...updates }: { id: string; name?: string; is_official?: boolean; description?: string }) =>
      tagService.updateTag(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });

  const deleteTag = useMutation({
    mutationFn: tagService.deleteTag,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });

  const mergeTags = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      tagService.mergeTags(sourceId, targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });

  return { updateTag, deleteTag, mergeTags };
};
