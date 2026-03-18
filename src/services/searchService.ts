/**
 * Search Service — Full-Text Search + Recent Cards via Supabase RPC.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SearchResult, RecentCard } from '@/types/search';

export async function searchUserContent(
  query: string,
  folderId?: string | null,
  limit = 30,
): Promise<SearchResult[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase.rpc('search_user_content', {
    p_user_id: user.id,
    p_query: query,
    p_folder_id: folderId ?? null,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as SearchResult[];
}

export async function getRecentCards(
  folderId?: string | null,
  limit = 50,
): Promise<RecentCard[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase.rpc('get_recent_cards', {
    p_user_id: user.id,
    p_folder_id: folderId ?? null,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as RecentCard[];
}
