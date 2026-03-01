/**
 * Service layer for tag CRUD operations.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Tag } from '@/types/tag';

/** Search tags by name with fuzzy matching, ordered by usage. */
export async function searchTags(query: string, limit = 20): Promise<Tag[]> {
  if (!query.trim()) {
    // Return most popular tags
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .is('merged_into_id', null)
      .order('usage_count', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .is('merged_into_id', null)
    .ilike('name', `%${query}%`)
    .order('usage_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Create a new tag. Returns the created tag. */
export async function createTag(name: string, userId: string): Promise<Tag> {
  const slug = generateSlug(name);
  
  // Check if slug already exists
  const { data: existing } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  
  if (existing) return existing as Tag;

  const { data, error } = await supabase
    .from('tags')
    .insert({ name: name.trim(), slug, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Tag;
}

/** Get tags for a specific deck. */
export async function getDeckTags(deckId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('deck_tags')
    .select('tag_id, tags(*)')
    .eq('deck_id', deckId);
  if (error) throw error;
  return (data ?? []).map((dt: any) => dt.tags).filter(Boolean);
}

/** Get tags for a specific card. */
export async function getCardTags(cardId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('card_tags')
    .select('tag_id, tags(*)')
    .eq('card_id', cardId);
  if (error) throw error;
  return (data ?? []).map((ct: any) => ct.tags).filter(Boolean);
}

/** Add a tag to a deck. */
export async function addDeckTag(deckId: string, tagId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('deck_tags')
    .insert({ deck_id: deckId, tag_id: tagId, added_by: userId });
  if (error && !error.message.includes('duplicate')) throw error;
}

/** Remove a tag from a deck. */
export async function removeDeckTag(deckId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('deck_tags')
    .delete()
    .eq('deck_id', deckId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

/** Add a tag to a card. */
export async function addCardTag(cardId: string, tagId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('card_tags')
    .insert({ card_id: cardId, tag_id: tagId, added_by: userId });
  if (error && !error.message.includes('duplicate')) throw error;
}

/** Remove a tag from a card. */
export async function removeCardTag(cardId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('card_tags')
    .delete()
    .eq('card_id', cardId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

/** Get all tags (for dashboard). */
export async function getAllTags(limit = 100): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .is('merged_into_id', null)
    .order('usage_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Get tags for multiple decks at once (batch). */
export async function getDeckTagsBatch(deckIds: string[]): Promise<Record<string, Tag[]>> {
  if (deckIds.length === 0) return {};
  const { data, error } = await supabase
    .from('deck_tags')
    .select('deck_id, tag_id, tags(*)')
    .in('deck_id', deckIds);
  if (error) throw error;
  
  const result: Record<string, Tag[]> = {};
  (data ?? []).forEach((dt: any) => {
    if (!dt.tags) return;
    if (!result[dt.deck_id]) result[dt.deck_id] = [];
    result[dt.deck_id].push(dt.tags);
  });
  return result;
}

export interface TagSuggestion {
  name: string;
  isExisting: boolean;
  usageCount: number;
}

/** Ask AI to suggest tags for content. */
export async function suggestTags(params: {
  textContent?: string;
  deckName?: string;
  existingTagNames?: string[];
}): Promise<TagSuggestion[]> {
  const { data, error } = await supabase.functions.invoke('suggest-tags', {
    body: params,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.suggestions ?? [];
}

/** Merge tags (admin only). Reassigns all associations from source to target. */
export async function mergeTags(sourceId: string, targetId: string): Promise<void> {
  // Move deck_tags
  const { data: deckAssocs } = await supabase
    .from('deck_tags')
    .select('deck_id')
    .eq('tag_id', sourceId);
  
  for (const assoc of (deckAssocs ?? [])) {
    await supabase.from('deck_tags')
      .upsert({ deck_id: assoc.deck_id, tag_id: targetId, added_by: null }, { onConflict: 'deck_id,tag_id' });
  }
  await supabase.from('deck_tags').delete().eq('tag_id', sourceId);

  // Move card_tags
  const { data: cardAssocs } = await supabase
    .from('card_tags')
    .select('card_id')
    .eq('tag_id', sourceId);
  
  for (const assoc of (cardAssocs ?? [])) {
    await supabase.from('card_tags')
      .upsert({ card_id: assoc.card_id, tag_id: targetId, added_by: null }, { onConflict: 'card_id,tag_id' });
  }
  await supabase.from('card_tags').delete().eq('tag_id', sourceId);

  // Mark source as merged
  await supabase.from('tags').update({ merged_into_id: targetId }).eq('id', sourceId);
}

/** Update tag (admin). */
export async function updateTag(id: string, updates: { name?: string; is_official?: boolean; description?: string }): Promise<void> {
  const { error } = await supabase.from('tags').update(updates).eq('id', id);
  if (error) throw error;
}

/** Delete tag (admin). */
export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from('tags').delete().eq('id', id);
  if (error) throw error;
}

// ---- Helpers ----

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
