/**
 * Dashboard service — queries used exclusively by dashboard components.
 * Covers WeekStrip, SalaList, CommunityRecommendations, DashboardDueThemes, DeckList.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ───

export interface CommunityFolderMeta {
  ownerName: string;
  lastUpdated: string;
  coverUrl: string | null;
  deckCount: number;
  cardCount: number;
}

export interface CommunityRecommendation {
  id: string;
  title: string;
  deck_id: string;
  deck_count: number;
  card_count: number;
  question_count: number;
  category: string;
  seller_id: string;
  seller_name?: string;
  turma_id?: string;
}

export interface ProfileCapacity {
  daily_study_minutes: number;
  weekly_study_minutes: Record<string, number> | null;
  weekly_new_cards: Record<string, number> | null;
}

// ─── WeekStrip ───

export async function fetchWeekReviewDates(userId: string, sinceISO: string): Promise<string[]> {
  const { data } = await supabase
    .from('review_logs')
    .select('reviewed_at')
    .eq('user_id', userId)
    .gte('reviewed_at', sinceISO)
    .order('reviewed_at', { ascending: false });
  return (data ?? []).map(l => l.reviewed_at);
}

// ─── SalaList ───

export async function fetchDeckQuestionCounts(deckIds: string[]): Promise<Map<string, number>> {
  if (deckIds.length === 0) return new Map();
  const { data } = await supabase
    .from('deck_questions')
    .select('deck_id')
    .in('deck_id', deckIds);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + 1);
  }
  return counts;
}

export async function fetchCommunityFolderMeta(turmaIds: string[]): Promise<Map<string, CommunityFolderMeta>> {
  if (turmaIds.length === 0) return new Map();
  const [turmasRes, turmaDecksRes] = await Promise.all([
    supabase.from('turmas').select('id, owner_id, cover_image_url').in('id', turmaIds),
    supabase.from('turma_decks').select('turma_id, deck_id').in('turma_id', turmaIds).eq('is_published', true),
  ]);
  const turmas = turmasRes.data;
  if (!turmas) return new Map();

  const ownerIds = [...new Set(turmas.map(t => t.owner_id))];
  const deckIdsByTurma = new Map<string, string[]>();
  for (const td of turmaDecksRes.data ?? []) {
    const arr = deckIdsByTurma.get(td.turma_id) ?? [];
    arr.push(td.deck_id);
    deckIdsByTurma.set(td.turma_id, arr);
  }
  const allTDeckIds = (turmaDecksRes.data ?? []).map(td => td.deck_id);

  const [profilesRes, tDecksRes] = await Promise.all([
    supabase.rpc('get_public_profiles' as 'get_public_profiles', { p_user_ids: ownerIds }),
    allTDeckIds.length > 0
      ? supabase.from('decks').select('id, updated_at').in('id', allTDeckIds)
      : Promise.resolve({ data: [] as { id: string; updated_at: string }[] }),
  ]);

  type ProfileRow = { id: string; name: string };
  const profileMap = new Map(((profilesRes.data ?? []) as ProfileRow[]).map(p => [p.id, p.name]));
  const lastUpdatedMap = new Map<string, string>();
  const deckList = (tDecksRes as { data: { id: string; updated_at: string }[] | null }).data ?? [];
  for (const d of deckList) {
    for (const [tid, dids] of deckIdsByTurma.entries()) {
      if (dids.includes(d.id)) {
        const cur = lastUpdatedMap.get(tid) ?? '';
        if (d.updated_at > cur) lastUpdatedMap.set(tid, d.updated_at);
      }
    }
  }

  const result = new Map<string, CommunityFolderMeta>();
  for (const t of turmas) {
    result.set(t.id, {
      ownerName: profileMap.get(t.owner_id) || 'Anônimo',
      lastUpdated: lastUpdatedMap.get(t.id) ?? '',
      coverUrl: t.cover_image_url,
      deckCount: deckIdsByTurma.get(t.id)?.length ?? 0,
      cardCount: 0,
    });
  }
  return result;
}

// ─── CommunityRecommendations ───

export async function fetchCommunityRecommendations(userId: string | undefined): Promise<CommunityRecommendation[]> {
  const results: CommunityRecommendation[] = [];

  // 1) Marketplace listings
  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('id, title, deck_id, card_count, category, seller_id')
    .eq('is_published', true)
    .order('downloads', { ascending: false })
    .limit(20);

  if (listings && listings.length > 0) {
    const sellerIds = [...new Set(listings.map(l => l.seller_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sellerIds);
    const profileMap = new Map<string, string>();
    if (profiles) for (const p of profiles) profileMap.set(p.id, p.name);

    let ownedSourceIds = new Set<string>();
    if (userId) {
      const { data: ownedDecks } = await supabase.from('decks').select('source_listing_id').eq('user_id', userId).not('source_listing_id', 'is', null);
      if (ownedDecks) ownedSourceIds = new Set(ownedDecks.map(d => d.source_listing_id!));
    }

    for (const l of listings) {
      if (l.seller_id === userId) continue;
      if (ownedSourceIds.has(l.id)) continue;
      results.push({
        id: l.id, title: l.title, deck_id: l.deck_id, deck_count: 1, card_count: l.card_count,
        question_count: 0, category: l.category, seller_id: l.seller_id,
        seller_name: profileMap.get(l.seller_id),
      });
    }
  }

  // 2) Community (turma) shared decks
  if (results.length < 6) {
    const { data: turmaDecks } = await supabase
      .from('turma_decks')
      .select('id, deck_id, turma_id')
      .order('created_at', { ascending: false })
      .limit(20);

    if (turmaDecks && turmaDecks.length > 0) {
      const tdDeckIds = turmaDecks.map(td => td.deck_id);
      const { data: decks } = await supabase.from('decks').select('id, name, user_id').in('id', tdDeckIds);
      const deckMap = new Map<string, { name: string; user_id: string }>();
      if (decks) for (const d of decks) deckMap.set(d.id, { name: d.name, user_id: d.user_id });

      const turmaIds = [...new Set(turmaDecks.map(td => td.turma_id))];
      const { data: turmas } = await supabase.from('turmas').select('id, name').in('id', turmaIds);
      const turmaMap = new Map<string, string>();
      if (turmas) for (const t of turmas) turmaMap.set(t.id, t.name);

      const { data: cardCounts } = await supabase.from('cards').select('deck_id').in('deck_id', tdDeckIds);
      const countMap = new Map<string, number>();
      if (cardCounts) for (const c of cardCounts) countMap.set(c.deck_id, (countMap.get(c.deck_id) ?? 0) + 1);

      const seenIds = new Set(results.map(r => r.deck_id));
      for (const td of turmaDecks) {
        if (seenIds.has(td.deck_id)) continue;
        const deck = deckMap.get(td.deck_id);
        if (!deck) continue;
        seenIds.add(td.deck_id);
        results.push({
          id: td.id, title: deck.name, deck_id: td.deck_id, deck_count: 1,
          card_count: countMap.get(td.deck_id) ?? 0, question_count: 0,
          category: '', seller_id: deck.user_id, seller_name: turmaMap.get(td.turma_id),
          turma_id: td.turma_id,
        });
      }
    }
  }

  return results.slice(0, 12);
}

// ─── DashboardDueThemes ───

export async function findConceptLinkedDeck(conceptId: string): Promise<string | null> {
  const { data: links } = await supabase
    .from('question_concepts')
    .select('question_id')
    .eq('concept_id', conceptId)
    .limit(1);

  if (!links || links.length === 0) return null;

  const { data: question } = await supabase
    .from('deck_questions')
    .select('deck_id')
    .eq('id', links[0].question_id)
    .maybeSingle();

  return question?.deck_id ?? null;
}

// ─── DeckCard ───

export async function findTurmaDeckSource(sourceTurmaDeckId: string): Promise<{ turma_id: string; lesson_id: string | null } | null> {
  const { data } = await supabase
    .from('turma_decks')
    .select('turma_id, lesson_id')
    .eq('id', sourceTurmaDeckId)
    .single();
  return (data as { turma_id: string; lesson_id: string | null } | null) ?? null;
}

// ─── DeckPreviewSheet ───

export async function fetchPreviewCards(deckId: string) {
  const { data, error } = await supabase
    .from('cards')
    .select('id, front_content, back_content, card_type')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// ─── CardList tag batch ───

export async function fetchCardTagsBatch(cardIds: string[]): Promise<Record<string, { id: string; name: string; is_official: boolean }[]>> {
  if (cardIds.length === 0) return {};
  const BATCH = 300;
  const map: Record<string, { id: string; name: string; is_official: boolean }[]> = {};
  for (let i = 0; i < cardIds.length; i += BATCH) {
    const batch = cardIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('card_tags')
      .select('card_id, tags(id, name, is_official)')
      .in('card_id', batch);
    if (data) {
      for (const row of data) {
        const tags = row.tags as unknown as { id: string; name: string; is_official: boolean } | null;
        if (!tags) continue;
        if (!map[row.card_id]) map[row.card_id] = [];
        map[row.card_id].push(tags);
      }
    }
  }
  return map;
}

// ─── DeckStatsTab ───

export async function fetchProfileCapacity(userId: string): Promise<ProfileCapacity | null> {
  const { data } = await supabase
    .from('profiles')
    .select('daily_study_minutes, weekly_study_minutes, weekly_new_cards')
    .eq('id', userId)
    .single();
  return data as ProfileCapacity | null;
}

// ─── SuggestCorrectionModal ───

export async function resolveDeckSource(deckId: string): Promise<string> {
  const { data } = await supabase
    .from('decks')
    .select('source_turma_deck_id, community_id, is_live_deck, name, user_id, source_listing_id')
    .eq('id', deckId)
    .single();
  if (!data) return deckId;

  // 1) via source_turma_deck_id
  if (data.source_turma_deck_id) {
    const { data: td } = await supabase
      .from('turma_decks')
      .select('deck_id')
      .eq('id', data.source_turma_deck_id)
      .single();
    if (td?.deck_id) return td.deck_id;
  }

  // 2) via source_listing_id
  if (data.source_listing_id) {
    const { data: listing } = await supabase
      .from('marketplace_listings')
      .select('deck_id')
      .eq('id', data.source_listing_id)
      .single();
    if (listing?.deck_id) return listing.deck_id;
  }

  // 3) Fallback for is_live_deck
  if (data.is_live_deck && !data.source_turma_deck_id && !data.source_listing_id) {
    const { data: original } = await supabase
      .from('decks')
      .select('id')
      .eq('name', data.name)
      .eq('is_public', true)
      .neq('user_id', data.user_id)
      .limit(1)
      .maybeSingle();
    if (original?.id) return original.id;
  }

  return deckId;
}

export async function insertDeckSuggestion(payload: Record<string, unknown>) {
  const { error } = await supabase.from('deck_suggestions').insert(payload as Record<string, unknown>);
  if (error) throw error;
}

// ─── Community deck updates (RPC) ───

export interface CommunityDeckUpdateRow {
  local_deck_id: string;
  has_update: boolean;
}

export async function fetchCommunityDeckUpdates(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_community_deck_updates' as 'get_community_deck_updates', { p_user_id: userId });
  if (error) return new Set<string>();
  const pending = new Set<string>();
  for (const row of (data as CommunityDeckUpdateRow[] | null) ?? []) {
    if (row.has_update) pending.add(row.local_deck_id);
  }
  return pending;
}
