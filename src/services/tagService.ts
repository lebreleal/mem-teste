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
