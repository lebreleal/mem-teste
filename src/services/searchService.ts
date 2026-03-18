/**
 * Search Service — Full-Text Search via Supabase RPC.
 * Calls search_user_content RPC for deck + card search.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SearchResult } from '@/types/search';

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
