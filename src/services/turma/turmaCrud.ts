/**
 * Turma CRUD + Discover operations.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Turma } from '@/types/turma';

// ── Row interfaces for query results ──

interface TurmaRow {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  is_private: boolean;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
  subscription_price: number | null;
  share_slug: string | null;
  avg_rating: number | null;
  rating_count: number | null;
  invite_code: string;
}

interface PublicProfileRow {
  id: string;
  name: string | null;
}

interface TurmaDeckLinkRow {
  turma_id: string;
  deck_id: string;
}

interface CardCountRow {
  deck_id: string;
  card_count: number;
}

interface TurmaMembershipRow {
  turma_id: string;
}

interface DeckIdRow {
  id: string;
}

interface DeckNameRow {
  id: string;
  name: string;
}

interface DeckDateRow {
  id: string;
  updated_at: string;
}

interface DeckQuestionRow {
  deck_id: string;
}

export async function fetchUserTurmas(userId: string): Promise<Turma[]> {
  const { data: memberships } = await supabase
    .from('turma_members').select('turma_id').eq('user_id', userId);

  let turmas: TurmaRow[];
  if (!memberships || memberships.length === 0) {
    const { data: owned } = await supabase.from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').eq('owner_id', userId);
    turmas = (owned ?? []) as TurmaRow[];
  } else {
    const turmaIds = memberships.map(m => m.turma_id);
    const { data } = await supabase
      .from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').or(`id.in.(${turmaIds.join(',')}),owner_id.eq.${userId}`);
    turmas = (data ?? []) as TurmaRow[];
  }

  // Enrich with owner names
  const ownerIds = [...new Set(turmas.map(t => t.owner_id))];
  let enrichedTurmas = turmas as (TurmaRow & { owner_name?: string; card_count?: number })[];
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
    const profileMap = new Map(((profiles ?? []) as PublicProfileRow[]).map(p => [p.id, p.name || 'Anônimo']));
    enrichedTurmas = enrichedTurmas.map(t => ({ ...t, owner_name: profileMap.get(t.owner_id) ?? 'Anônimo' }));
  }

  // Enrich with card counts
  const turmaIds = enrichedTurmas.map(t => t.id);
  if (turmaIds.length > 0) {
    const { data: turmaDecks } = await supabase
      .from('turma_decks')
      .select('turma_id, deck_id')
      .in('turma_id', turmaIds)
      .eq('is_published', true);
    const allDeckIds = ((turmaDecks ?? []) as TurmaDeckLinkRow[]).map(td => td.deck_id);
    if (allDeckIds.length > 0) {
      const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
      const deckCardMap = new Map(((countRows ?? []) as CardCountRow[]).map(r => [r.deck_id, Number(r.card_count)]));
      const cardCountMap = new Map<string, number>();
      ((turmaDecks ?? []) as TurmaDeckLinkRow[]).forEach(td => {
        const cards = deckCardMap.get(td.deck_id) ?? 0;
        cardCountMap.set(td.turma_id, (cardCountMap.get(td.turma_id) ?? 0) + cards);
      });
      enrichedTurmas = enrichedTurmas.map(t => ({ ...t, card_count: cardCountMap.get(t.id) ?? 0 }));
    }
  }

  return enrichedTurmas as unknown as Turma[];
}

export async function fetchTurma(turmaId: string): Promise<Turma | null> {
  const { data } = await supabase.from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').eq('id', turmaId).single();
  return data as Turma | null;
}


export async function leaveTurma(turmaId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
  const { error } = await (supabase.rpc as any)('leave_turma', { _turma_id: turmaId });
  if (error) throw error;
}

interface TurmaUpdateFields {
  name?: string;
  description?: string;
  is_private?: boolean;
  cover_image_url?: string;
  subscription_price?: number;
  share_slug?: string | null;
}

export async function updateTurma(turmaId: string, updates: { name?: string; description?: string; isPrivate?: boolean; coverImageUrl?: string; subscriptionPrice?: number; shareSlug?: string }) {
  const data: TurmaUpdateFields = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.isPrivate !== undefined) data.is_private = updates.isPrivate;
  if (updates.coverImageUrl !== undefined) data.cover_image_url = updates.coverImageUrl;
  if (updates.subscriptionPrice !== undefined) data.subscription_price = updates.subscriptionPrice;
  if (updates.shareSlug !== undefined) data.share_slug = updates.shareSlug || null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial update
  const { error } = await supabase.from('turmas').update(data as any).eq('id', turmaId);
  if (error) throw error;
}

export async function fetchTurmaBySlug(slug: string): Promise<Turma | null> {
  const { data } = await supabase.from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').eq('share_slug', slug).single();
  return data as Turma | null;
}

// ── Discover ──

interface DiscoverTurmaResult extends Turma {
  member_count: number;
  owner_name: string;
  deck_count: number;
  card_count: number;
  question_count: number;
  last_updated: string;
}

export async function fetchDiscoverTurmas(_userId: string, searchQuery: string): Promise<DiscoverTurmaResult[]> {
  const { data: publicTurmas } = await supabase
    .from('turmas')
    .select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code')
    .or('is_private.eq.false,share_slug.not.is.null')
    .order('created_at', { ascending: false })
    .limit(200);

  let allTurmas = [...((publicTurmas ?? []) as TurmaRow[])];
  const q = searchQuery.trim().toLowerCase();

  if (q && allTurmas.length > 0) {
    const bySalaText = allTurmas.filter(t =>
      String(t.name ?? '').toLowerCase().includes(q) ||
      String(t.description ?? '').toLowerCase().includes(q)
    );

    const bySalaIds = new Set(bySalaText.map(t => t.id));

    const { data: matchedDecks } = await supabase
      .from('decks')
      .select('id')
      .ilike('name', `%${q}%`)
      .limit(300);

    if (matchedDecks && matchedDecks.length > 0) {
      const deckIds = (matchedDecks as DeckIdRow[]).map(d => d.id);
      const { data: links } = await supabase
        .from('turma_decks')
        .select('turma_id, deck_id')
        .eq('is_published', true)
        .in('deck_id', deckIds);

      const matchTurmaIds = new Set(((links ?? []) as TurmaDeckLinkRow[]).map(l => l.turma_id));
      allTurmas = bySalaText.concat(allTurmas.filter(t => matchTurmaIds.has(t.id) && !bySalaIds.has(t.id)));
    } else {
      allTurmas = bySalaText;
    }
  }

  if (allTurmas.length === 0) return [];

  const ownerIds = [...new Set(allTurmas.map(t => t.owner_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
  const profileMap = new Map(((profiles ?? []) as PublicProfileRow[]).map(p => [p.id, p.name || 'Anônimo']));

  const turmaIds = allTurmas.map(t => t.id);

  const { data: members } = await supabase
    .from('turma_members')
    .select('turma_id')
    .in('turma_id', turmaIds);

  const memberCountMap = new Map<string, number>();
  ((members ?? []) as TurmaMembershipRow[]).forEach(m => memberCountMap.set(m.turma_id, (memberCountMap.get(m.turma_id) ?? 0) + 1));

  const { data: turmaDecks } = await supabase
    .from('turma_decks')
    .select('turma_id, deck_id')
    .in('turma_id', turmaIds)
    .eq('is_published', true);

  const typedTurmaDecks = (turmaDecks ?? []) as TurmaDeckLinkRow[];
  const allDeckIds = typedTurmaDecks.map(td => td.deck_id);
  const cardCountMap = new Map<string, number>();
  const deckCountMap = new Map<string, number>();

  typedTurmaDecks.forEach(td => {
    deckCountMap.set(td.turma_id, (deckCountMap.get(td.turma_id) ?? 0) + 1);
  });

  if (allDeckIds.length > 0) {
    const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
    const deckCardMap = new Map(((countRows ?? []) as CardCountRow[]).map(r => [r.deck_id, Number(r.card_count)]));

    typedTurmaDecks.forEach(td => {
      const cards = deckCardMap.get(td.deck_id) ?? 0;
      cardCountMap.set(td.turma_id, (cardCountMap.get(td.turma_id) ?? 0) + cards);
    });
  }

  // Question counts per turma
  const questionCountMap = new Map<string, number>();
  if (allDeckIds.length > 0) {
    const { data: qRows } = await supabase
      .from('deck_questions')
      .select('deck_id')
      .in('deck_id', allDeckIds);
    const perDeck = new Map<string, number>();
    for (const r of (qRows ?? []) as DeckQuestionRow[]) {
      perDeck.set(r.deck_id, (perDeck.get(r.deck_id) ?? 0) + 1);
    }
    typedTurmaDecks.forEach(td => {
      const qc = perDeck.get(td.deck_id) ?? 0;
      if (qc > 0) questionCountMap.set(td.turma_id, (questionCountMap.get(td.turma_id) ?? 0) + qc);
    });
  }

  // Last updated: use max updated_at from decks
  const lastUpdatedMap = new Map<string, string>();
  if (allDeckIds.length > 0) {
    const { data: deckDates } = await supabase
      .from('decks')
      .select('id, updated_at')
      .in('id', allDeckIds);
    const deckDateMap = new Map(((deckDates ?? []) as DeckDateRow[]).map(d => [d.id, d.updated_at]));
    typedTurmaDecks.forEach(td => {
      const dt = deckDateMap.get(td.deck_id);
      if (dt) {
        const current = lastUpdatedMap.get(td.turma_id);
        if (!current || dt > current) lastUpdatedMap.set(td.turma_id, dt);
      }
    });
  }

  return allTurmas.map(t => ({
    ...t,
    member_count: memberCountMap.get(t.id) ?? 0,
    deck_count: deckCountMap.get(t.id) ?? 0,
    card_count: cardCountMap.get(t.id) ?? 0,
    question_count: questionCountMap.get(t.id) ?? 0,
    last_updated: lastUpdatedMap.get(t.id) ?? t.created_at ?? '',
    owner_name: profileMap.get(t.owner_id) ?? 'Anônimo',
    avg_rating: t.avg_rating ?? 0,
    rating_count: t.rating_count ?? 0,
  })) as unknown as DiscoverTurmaResult[];
}

// ── Community Preview ──

export async function fetchCreatorStats(ownerId: string) {
  const { data: decks } = await supabase.from('turma_decks').select('deck_id').eq('shared_by', ownerId);
  const totalDecks = decks?.length ?? 0;
  let totalCards = 0;
  if (decks && decks.length > 0) {
    const deckIds = decks.map(d => d.deck_id);
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', deckIds);
    totalCards = count ?? 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_exams not in generated types
  const { count: examCount } = await (supabase.from('turma_exams' as 'turmas') as ReturnType<typeof supabase.from>).select('id', { count: 'exact', head: true }).eq('created_by', ownerId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- review_logs not in generated types
  const { count: reviewCount } = await (supabase.from('review_logs' as 'turmas') as ReturnType<typeof supabase.from>).select('id', { count: 'exact', head: true }).eq('user_id', ownerId);
  return { totalDecks, totalCards, totalReviews: reviewCount ?? 0, totalExams: examCount ?? 0 };
}

interface CommunityContentStats {
  subjects: { id: string; name: string; lessonCount: number; cardCount: number; fileCount: number }[];
  rootLessons: { id: string; name: string }[];
}

interface RpcSubject {
  id: string;
  name: string;
  lessonCount?: number;
  cardCount?: number;
  fileCount?: number;
}

interface RpcLesson {
  id: string;
  name: string;
}

export async function fetchCommunityContentStats(turmaId: string): Promise<CommunityContentStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
  const { data, error } = await (supabase.rpc as any)('get_community_preview_stats', { p_turma_id: turmaId });
  if (error || !data) return { subjects: [], rootLessons: [] };
  const d = data as unknown as { subjects?: RpcSubject[]; rootLessons?: RpcLesson[] };
  return {
    subjects: (d.subjects ?? []).map(s => ({ id: s.id, name: s.name, lessonCount: s.lessonCount ?? 0, cardCount: s.cardCount ?? 0, fileCount: s.fileCount ?? 0 })),
    rootLessons: (d.rootLessons ?? []).map(l => ({ id: l.id, name: l.name })),
  };
}

// ── Dashboard-specific turma helpers ──

export async function fetchUserOwnTurma(userId: string): Promise<{ id: string; name: string; is_private: boolean; share_slug: string | null; owner_name: string | null } | null> {
  const { data } = await supabase
    .from('turmas')
    .select('id, name, is_private, share_slug, owner_id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: profile } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle();
  return { id: data.id, name: data.name, is_private: data.is_private, share_slug: data.share_slug, owner_name: profile?.name ?? null };
}

export async function fetchCommunityFolderInfo(turmaId: string) {
  const [turmaRes, turmaDecksRes] = await Promise.all([
    supabase.from('turmas').select('id, name, owner_id, cover_image_url').eq('id', turmaId).single(),
    supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId).eq('is_published', true),
  ]);
  const turma = turmaRes.data;
  if (!turma) return null;
  const deckIds = (turmaDecksRes.data ?? []).map(td => td.deck_id);
  const [profilesRes, deckDatesRes] = await Promise.all([
    supabase.rpc('get_public_profiles', { p_user_ids: [turma.owner_id] }),
    deckIds.length > 0
      ? supabase.from('decks').select('updated_at').in('id', deckIds).order('updated_at', { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { updated_at: string }[] }),
  ]);
  const profileRows = (profilesRes.data ?? []) as PublicProfileRow[];
  const ownerName = profileRows[0]?.name || 'Anônimo';
  const dateRows = (deckDatesRes.data ?? []) as { updated_at: string }[];
  const lastUpdated = dateRows[0]?.updated_at ?? '';
  return { ownerName, lastUpdated, coverUrl: turma.cover_image_url as string | null };
}

export async function createTurmaWithOwner(
  userId: string,
  name: string,
  options?: { isPrivate?: boolean; coverImageUrl?: string | null },
): Promise<{ id: string; share_slug: string | null }> {
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data: newTurma, error } = await supabase
    .from('turmas')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- insert typing
    .insert({
      name,
      description: '',
      owner_id: userId,
      invite_code: inviteCode,
      is_private: options?.isPrivate ?? false,
      cover_image_url: options?.coverImageUrl ?? null,
    } as any)
    .select('id, share_slug')
    .single();
  if (error || !newTurma) throw error || new Error('Failed to create turma');
  const result = newTurma as { id: string; share_slug: string | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- insert typing
  await supabase.from('turma_members').insert({ turma_id: result.id, user_id: userId, role: 'admin' } as any);
  return result;
}

export async function publishDecksToTurma(turmaId: string, userId: string, deckIds: string[]) {
  if (deckIds.length === 0) return;
  const { data: existingTurmaDecks } = await supabase
    .from('turma_decks')
    .select('deck_id')
    .eq('turma_id', turmaId);
  const existingIds = new Set((existingTurmaDecks ?? []).map(td => td.deck_id));
  const newIds = deckIds.filter(id => !existingIds.has(id));
  if (newIds.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- insert typing
  await supabase.from('turma_decks').insert(
    newIds.map(id => ({
      turma_id: turmaId,
      deck_id: id,
      shared_by: userId,
      price: 0,
      price_type: 'free',
      allow_download: true,
      is_published: true,
    })) as any,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial update
  await supabase.from('decks').update({ is_public: true } as any).in('id', newIds);
}

export async function removeTurmaMember(turmaId: string, userId: string) {
  const { error } = await supabase
    .from('turma_members')
    .delete()
    .eq('turma_id', turmaId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function ensureShareSlug(turmaId: string): Promise<string> {
  const { data } = await supabase.from('turmas').select('share_slug').eq('id', turmaId).single();
  const existing = data?.share_slug;
  if (existing) return existing;

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let generated = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    generated = '';
    for (let i = 0; i < 6; i++) generated += chars[Math.floor(Math.random() * chars.length)];
    const { data: clash } = await supabase.from('turmas').select('id').eq('share_slug', generated).limit(1);
    if (!clash || clash.length === 0) break;
  }

  await supabase.from('turmas').update({ share_slug: generated } as never).eq('id', turmaId);
  return generated;
}
