/**
 * Admin service — abstracts admin-only Supabase operations.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Error Logs ──

export interface ErrorLog {
  id: string;
  user_id: string | null;
  error_message: string;
  error_stack: string;
  component_name: string;
  route: string;
  metadata: Record<string, unknown>;
  severity: string;
  created_at: string;
}

export async function fetchErrorLogs(params: { severity?: string; search?: string; limit?: number }): Promise<ErrorLog[]> {
  let query = supabase
    .from('app_error_logs')
    .select('id, user_id, error_message, error_stack, component_name, route, metadata, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 200);

  if (params.severity && params.severity !== 'all') {
    query = query.eq('severity', params.severity);
  }
  if (params.search?.trim()) {
    query = query.ilike('error_message', `%${params.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ErrorLog[];
}

export async function deleteOldErrorLogs(olderThanDays = 30): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const { error } = await supabase
    .from('app_error_logs')
    .delete()
    .lt('created_at', cutoff.toISOString());
  if (error) throw error;
}

// ── AI Usage Report ──

export interface UsageEntry {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  feature_key: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  energy_cost: number;
}

export async function fetchGlobalTokenUsage(params: {
  dateFrom: string | null;
  dateTo: string | null;
  limit?: number;
}): Promise<UsageEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
  const { data, error } = await (supabase.rpc as any)('admin_get_global_token_usage', {
    p_user_id: null,
    p_date_from: params.dateFrom,
    p_date_to: params.dateTo,
    p_limit: params.limit ?? 500,
  });
  if (error) throw error;
  return (data as unknown as UsageEntry[]) || [];
}

export async function deleteTokenUsageEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('ai_token_usage').delete().eq('id', entryId);
  if (error) throw error;
}

export async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

// ── Impersonation ──

export async function invokeImpersonate(targetUserId: string) {
  const { data, error } = await supabase.functions.invoke('admin-impersonate', {
    body: { target_user_id: targetUserId },
  });
  if (error || !data?.token) throw new Error('Failed to impersonate');
  return data as { token: string };
}

export async function verifyOtp(tokenHash: string) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) throw error;
}

export async function fetchProfilePremiumExpiry(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('premium_expires_at').eq('id', userId).single();
  return data?.premium_expires_at ?? null;
}

// ── Active Subscription ──

export async function fetchActiveSubscription(turmaId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_subscriptions not in generated types
  const { data } = await (supabase.from('turma_subscriptions' as 'turmas') as ReturnType<typeof supabase.from>).select('id, turma_id, user_id, expires_at')
    .eq('turma_id', turmaId).eq('user_id', userId).gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1);
  const rows = data as unknown as { id: string; turma_id: string; user_id: string; expires_at: string }[] | null;
  return rows && rows.length > 0 ? rows[0] : null;
}

// ── PublicCommunity queries ──

export async function fetchTurmaBySlugOrId(slugOrId: string) {
  const cols = 'id, name, description, owner_id, invite_code, created_at, is_private, avg_rating, rating_count, cover_image_url, subscription_price, share_slug';
  const { data: bySlug } = await supabase.from('turmas').select(cols).eq('share_slug', slugOrId).maybeSingle();
  if (bySlug) return bySlug;
  const { data: byId } = await supabase.from('turmas').select(cols).eq('id', slugOrId).maybeSingle();
  return byId;
}

export async function fetchOwnerName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single();
  return data?.name ?? '';
}

export async function fetchTurmaMemberCount(turmaId: string): Promise<number> {
  const { count } = await supabase.from('turma_members').select('id', { count: 'exact', head: true }).eq('turma_id', turmaId);
  return count ?? 0;
}

interface PublicDeckResult {
  turmaDeckId: string;
  deckId: string;
  name: string;
  cardCount: number;
}

export async function fetchPublicCommunityDecks(turmaId: string): Promise<PublicDeckResult[]> {
  const { data: tDecks } = await supabase
    .from('turma_decks')
    .select('id, deck_id, is_published')
    .eq('turma_id', turmaId)
    .eq('is_published', true);
  if (!tDecks || tDecks.length === 0) return [];

  const deckIds = tDecks.map(d => d.deck_id);
  const { data: deckInfo } = await supabase.from('decks').select('id, name').in('id', deckIds);
  const nameMap = new Map((deckInfo ?? []).map(d => [d.id, d.name]));

  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
  const countMap = new Map(((countRows ?? []) as { deck_id: string; card_count: number }[]).map(r => [r.deck_id, Number(r.card_count)]));

  return tDecks
    .map(td => ({
      turmaDeckId: td.id,
      deckId: td.deck_id,
      name: nameMap.get(td.deck_id) ?? 'Sem nome',
      cardCount: countMap.get(td.deck_id) ?? 0,
    }))
    .filter(d => !d.name.includes('Baralho de Erros'));
}

// ── TurmaDetail helpers ──

export async function joinTurmaAndCreateFolder(userId: string, turmaId: string, turmaName: string): Promise<string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_members insert typing
  await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: userId } as any);
  const { data: existingFolders } = await supabase.from('folders')
    .select('id').eq('user_id', userId).eq('source_turma_id', turmaId);
  let folderId: string | undefined;
  if (!existingFolders || existingFolders.length === 0) {
    const { data: newFolder } = await supabase.from('folders')
      .insert({ user_id: userId, name: turmaName, section: 'community', source_turma_id: turmaId })
      .select('id').single();
    folderId = newFolder?.id;
  } else {
    folderId = existingFolders[0].id;
  }
  return folderId;
}

export async function fetchTurmaFolderId(userId: string, turmaId: string): Promise<string | undefined> {
  const { data } = await supabase.from('folders')
    .select('id').eq('user_id', userId).eq('source_turma_id', turmaId).limit(1);
  return data?.[0]?.id;
}

// ── Sala Decks (TurmaDetail) ──

interface CardStatRow {
  id: string;
  deck_id: string;
  state: number;
  difficulty: number;
}

export async function fetchSalaDecksData(turmaId: string) {
  const { data: turmaDecks } = await supabase
    .from('turma_decks')
    .select('id, deck_id, is_published')
    .eq('turma_id', turmaId)
    .eq('is_published', true);

  if (!turmaDecks || turmaDecks.length === 0) return { turmaDecks: [], decks: [], rootDeckIds: [] as string[], allDeckIds: [] as string[], cardCountMap: new Map<string, { total: number; mastered: number; novo: number; facil: number; bom: number; dificil: number; errei: number }>() };

  const rootDeckIds = turmaDecks.map(td => td.deck_id);

  const { data: childDecks } = await supabase
    .from('decks')
    .select('id')
    .in('parent_deck_id', rootDeckIds)
    .eq('is_archived', false);

  const allDeckIds = [...rootDeckIds, ...(childDecks ?? []).map(d => d.id)];

  const { data: decks } = await supabase
    .from('decks')
    .select('id, name, user_id, parent_deck_id, folder_id, community_id, is_archived, is_public, is_live_deck, allow_duplication, is_free_in_community, algorithm_mode, daily_new_limit, daily_review_limit, requested_retention, max_interval, interval_modifier, easy_bonus, easy_graduating_interval, learning_steps, shuffle_cards, bury_siblings, bury_new_siblings, bury_review_siblings, bury_learning_siblings, sort_order, source_listing_id, source_turma_deck_id, synced_at, created_at, updated_at')
    .in('id', allDeckIds);

  const cardCountMap = new Map<string, { total: number; mastered: number; novo: number; facil: number; bom: number; dificil: number; errei: number }>();
  const PAGE = 1000;

  for (let i = 0; i < allDeckIds.length; i += 200) {
    const batch = allDeckIds.slice(i, i + 200);
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: cards } = await supabase
        .from('cards')
        .select('id, deck_id, state, difficulty')
        .in('deck_id', batch)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (cards) {
        for (const c of cards as CardStatRow[]) {
          const entry = cardCountMap.get(c.deck_id) ?? { total: 0, mastered: 0, novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
          entry.total++;
          entry.novo++;
          cardCountMap.set(c.deck_id, entry);
        }
      }
      hasMore = (cards?.length ?? 0) === PAGE;
      offset += PAGE;
    }
  }

  return { turmaDecks, decks: decks ?? [], rootDeckIds, allDeckIds, cardCountMap };
}

export async function insertTurmaMember(turmaId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_members insert
  const { error } = await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: userId } as any);
  if (error) throw error;
}

export async function getOrCreateTurmaFolder(userId: string, turmaId: string, turmaName: string): Promise<string | undefined> {
  const { data: existing } = await supabase.from('folders')
    .select('id').eq('user_id', userId).eq('source_turma_id', turmaId).limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const { data: newFolder } = await supabase.from('folders')
    .insert({ user_id: userId, name: turmaName, section: 'community', source_turma_id: turmaId })
    .select('id').single();
  return newFolder?.id;
}
