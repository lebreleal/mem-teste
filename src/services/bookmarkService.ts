/**
 * Bookmark Service — manages card bookmarks/favorites.
 */
import { supabase } from '@/integrations/supabase/client';

export interface CardBookmark {
  id: string;
  user_id: string;
  card_id: string;
  created_at: string;
}

/** Fetch all bookmarked card IDs for the current user. */
export async function fetchBookmarkedCardIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('card_bookmarks')
    .select('card_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map(r => (r as { card_id: string }).card_id));
}

/** Toggle bookmark on a card. Returns true if bookmarked, false if removed. */
export async function toggleBookmark(userId: string, cardId: string): Promise<boolean> {
  // Check if already bookmarked
  const { data: existing, error: checkErr } = await supabase
    .from('card_bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .maybeSingle();
  if (checkErr) throw checkErr;

  if (existing) {
    const { error } = await supabase
      .from('card_bookmarks')
      .delete()
      .eq('id', (existing as { id: string }).id);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .from('card_bookmarks')
      .insert({ user_id: userId, card_id: cardId } as Record<string, unknown>);
    if (error) throw error;
    return true;
  }
}
