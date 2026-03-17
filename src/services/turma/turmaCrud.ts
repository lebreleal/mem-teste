/**
 * Turma CRUD + Discover operations.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Turma } from '@/types/turma';

export async function fetchUserTurmas(userId: string): Promise<Turma[]> {
  const { data: memberships } = await supabase
    .from('turma_members').select('turma_id').eq('user_id', userId);

  let turmas: any[];
  if (!memberships || memberships.length === 0) {
    const { data: owned } = await supabase.from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').eq('owner_id', userId);
    turmas = owned ?? [];
  } else {
    const turmaIds = memberships.map(m => (m as any).turma_id);
    const { data } = await supabase
      .from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').or(`id.in.(${turmaIds.join(',')}),owner_id.eq.${userId}`);
    turmas = data ?? [];
  }

  // Enrich with owner names
  const ownerIds = [...new Set(turmas.map(t => t.owner_id))];
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));
    turmas = turmas.map(t => ({ ...t, owner_name: profileMap.get(t.owner_id) ?? 'Anônimo' }));
  }

  // Enrich with card counts
  const turmaIds = turmas.map(t => t.id);
  if (turmaIds.length > 0) {
    const { data: turmaDecks } = await supabase
      .from('turma_decks')
      .select('turma_id, deck_id')
      .in('turma_id', turmaIds)
      .eq('is_published', true);
    const allDeckIds = (turmaDecks ?? []).map((td: any) => td.deck_id);
    if (allDeckIds.length > 0) {
      const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
      const deckCardMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));
      const cardCountMap = new Map<string, number>();
      (turmaDecks ?? []).forEach((td: any) => {
        const cards = deckCardMap.get(td.deck_id) ?? 0;
        cardCountMap.set(td.turma_id, (cardCountMap.get(td.turma_id) ?? 0) + cards);
      });
      turmas = turmas.map(t => ({ ...t, card_count: cardCountMap.get(t.id) ?? 0 }));
    }
  }

  return turmas as Turma[];
}

export async function fetchTurma(turmaId: string): Promise<Turma | null> {
  const { data } = await supabase.from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').eq('id', turmaId).single();
  return data as Turma | null;
}


export async function leaveTurma(turmaId: string) {
  const { error } = await supabase.rpc('leave_turma', { _turma_id: turmaId } as any);
  if (error) throw error;
}

export async function updateTurma(turmaId: string, updates: { name?: string; description?: string; isPrivate?: boolean; coverImageUrl?: string; subscriptionPrice?: number; shareSlug?: string }) {
  const data: Record<string, any> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.isPrivate !== undefined) data.is_private = updates.isPrivate;
  if (updates.coverImageUrl !== undefined) data.cover_image_url = updates.coverImageUrl;
  if (updates.subscriptionPrice !== undefined) data.subscription_price = updates.subscriptionPrice;
  if (updates.shareSlug !== undefined) data.share_slug = updates.shareSlug || null;
  const { error } = await supabase.from('turmas').update(data as any).eq('id', turmaId);
  if (error) throw error;
}

export async function fetchTurmaBySlug(slug: string): Promise<Turma | null> {
  const { data } = await supabase.from('turmas').select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code').eq('share_slug', slug).single();
  return data as Turma | null;
}

// ── Discover ──

export async function fetchDiscoverTurmas(_userId: string, searchQuery: string): Promise<(Turma & { member_count: number; owner_name: string; deck_count: number; card_count: number; question_count: number; last_updated: string })[]> {
  // Only published/public Salas
  const { data: publicTurmas } = await supabase
    .from('turmas')
    .select('id, name, description, owner_id, is_private, cover_image_url, created_at, updated_at, subscription_price, share_slug, avg_rating, rating_count, invite_code')
    .or('is_private.eq.false,share_slug.not.is.null')
    .order('created_at', { ascending: false })
    .limit(200);

  let allTurmas = [...(publicTurmas ?? [])];
  const q = searchQuery.trim().toLowerCase();

  if (q && allTurmas.length > 0) {
    const bySalaText = allTurmas.filter((t: any) =>
      String(t.name ?? '').toLowerCase().includes(q) ||
      String(t.description ?? '').toLowerCase().includes(q)
    );

    const bySalaIds = new Set(bySalaText.map((t: any) => t.id));

    // Match by published deck names inside Salas
    const { data: matchedDecks } = await supabase
      .from('decks')
      .select('id')
      .ilike('name', `%${q}%`)
      .limit(300);

    if (matchedDecks && matchedDecks.length > 0) {
      const deckIds = matchedDecks.map((d: any) => d.id);
      const { data: links } = await supabase
        .from('turma_decks')
        .select('turma_id, deck_id')
        .eq('is_published', true)
        .in('deck_id', deckIds);

      const matchTurmaIds = new Set((links ?? []).map((l: any) => l.turma_id));
      allTurmas = bySalaText.concat(allTurmas.filter((t: any) => matchTurmaIds.has(t.id) && !bySalaIds.has(t.id)));
    } else {
      allTurmas = bySalaText;
    }
  }

  if (allTurmas.length === 0) return [];

  const ownerIds = [...new Set(allTurmas.map((t: any) => t.owner_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  const turmaIds = allTurmas.map((t: any) => t.id);

  const { data: members } = await supabase
    .from('turma_members')
    .select('turma_id')
    .in('turma_id', turmaIds);

  const memberCountMap = new Map<string, number>();
  (members ?? []).forEach((m: any) => memberCountMap.set(m.turma_id, (memberCountMap.get(m.turma_id) ?? 0) + 1));

  // Total cards from published decks of each Sala
  const { data: turmaDecks } = await supabase
    .from('turma_decks')
    .select('turma_id, deck_id')
    .in('turma_id', turmaIds)
    .eq('is_published', true);

  const allDeckIds = (turmaDecks ?? []).map((td: any) => td.deck_id);
  const cardCountMap = new Map<string, number>();
  const deckCountMap = new Map<string, number>();

  // Count decks per turma
  (turmaDecks ?? []).forEach((td: any) => {
    deckCountMap.set(td.turma_id, (deckCountMap.get(td.turma_id) ?? 0) + 1);
  });

  if (allDeckIds.length > 0) {
    const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
    const deckCardMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));

    (turmaDecks ?? []).forEach((td: any) => {
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
    for (const r of qRows ?? []) {
      perDeck.set(r.deck_id, (perDeck.get(r.deck_id) ?? 0) + 1);
    }
    (turmaDecks ?? []).forEach((td: any) => {
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
    const deckDateMap = new Map((deckDates ?? []).map((d: any) => [d.id, d.updated_at]));
    (turmaDecks ?? []).forEach((td: any) => {
      const dt = deckDateMap.get(td.deck_id);
      if (dt) {
        const current = lastUpdatedMap.get(td.turma_id);
        if (!current || dt > current) lastUpdatedMap.set(td.turma_id, dt);
      }
    });
  }

  return allTurmas.map((t: any) => ({
    ...t,
    member_count: memberCountMap.get(t.id) ?? 0,
    deck_count: deckCountMap.get(t.id) ?? 0,
    card_count: cardCountMap.get(t.id) ?? 0,
    question_count: questionCountMap.get(t.id) ?? 0,
    last_updated: lastUpdatedMap.get(t.id) ?? t.created_at ?? '',
    owner_name: profileMap.get(t.owner_id) ?? 'Anônimo',
    avg_rating: t.avg_rating ?? 0,
    rating_count: t.rating_count ?? 0,
  }));
}

// ── Community Preview ──

export async function fetchCreatorStats(ownerId: string) {
  const { data: decks } = await supabase.from('turma_decks').select('deck_id').eq('shared_by', ownerId);
  const totalDecks = decks?.length ?? 0;
  let totalCards = 0;
  if (decks && decks.length > 0) {
    const deckIds = decks.map((d: any) => d.deck_id);
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', deckIds);
    totalCards = count ?? 0;
  }
  const { count: examCount } = await supabase.from('turma_exams').select('id', { count: 'exact', head: true }).eq('created_by', ownerId);
  const { count: reviewCount } = await supabase.from('review_logs').select('id', { count: 'exact', head: true }).eq('user_id', ownerId);
  return { totalDecks, totalCards, totalReviews: reviewCount ?? 0, totalExams: examCount ?? 0 };
}

export async function fetchCommunityContentStats(turmaId: string) {
  const { data, error } = await supabase.rpc('get_community_preview_stats', { p_turma_id: turmaId });
  if (error || !data) return { subjects: [], rootLessons: [] };
  const d = data as any;
  return {
    subjects: (d.subjects ?? []).map((s: any) => ({ id: s.id, name: s.name, lessonCount: s.lessonCount ?? 0, cardCount: s.cardCount ?? 0, fileCount: s.fileCount ?? 0 })),
    rootLessons: (d.rootLessons ?? []).map((l: any) => ({ id: l.id, name: l.name })),
  };
}

// ── Dashboard-specific turma helpers ──

/** Fetch the user's own turma (for publish toggle). */
export async function fetchUserOwnTurma(userId: string): Promise<{ id: string; name: string; is_private: boolean; share_slug: string | null } | null> {
  const { data } = await supabase
    .from('turmas')
    .select('id, name, is_private, share_slug')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();
  return data as any;
}

/** Fetch community folder info (owner name, cover, last update). */
export async function fetchCommunityFolderInfo(turmaId: string) {
  const [turmaRes, turmaDecksRes] = await Promise.all([
    supabase.from('turmas').select('id, name, owner_id, cover_image_url').eq('id', turmaId).single(),
    supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId).eq('is_published', true),
  ]);
  const turma = turmaRes.data as any;
  if (!turma) return null;
  const deckIds = (turmaDecksRes.data ?? []).map((td: any) => td.deck_id);
  const [profilesRes, deckDatesRes] = await Promise.all([
    supabase.rpc('get_public_profiles' as any, { p_user_ids: [turma.owner_id] }),
    deckIds.length > 0
      ? supabase.from('decks').select('updated_at').in('id', deckIds).order('updated_at', { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const ownerName = (profilesRes.data as any)?.[0]?.name || 'Anônimo';
  const lastUpdated = (deckDatesRes.data as any)?.[0]?.updated_at ?? '';
  return { ownerName, lastUpdated, coverUrl: turma.cover_image_url as string | null };
}

/** Create a turma and add the owner as admin member. Returns turma id + share_slug. */
export async function createTurmaWithOwner(
  userId: string,
  name: string,
  options?: { isPrivate?: boolean; coverImageUrl?: string | null },
): Promise<{ id: string; share_slug: string | null }> {
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data: newTurma, error } = await supabase
    .from('turmas')
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
  await supabase.from('turma_members').insert({ turma_id: (newTurma as any).id, user_id: userId, role: 'admin' } as any);
  return newTurma as any;
}

/** Publish folder decks to a turma (sync turma_decks + set is_public). */
export async function publishDecksToTurma(turmaId: string, userId: string, deckIds: string[]) {
  if (deckIds.length === 0) return;
  const { data: existingTurmaDecks } = await supabase
    .from('turma_decks')
    .select('deck_id')
    .eq('turma_id', turmaId);
  const existingIds = new Set((existingTurmaDecks ?? []).map((td: any) => td.deck_id));
  const newIds = deckIds.filter(id => !existingIds.has(id));
  if (newIds.length === 0) return;
  await supabase.from('turma_decks').insert(
    newIds.map(id => ({
      turma_id: turmaId,
      deck_id: id,
      shared_by: userId,
      price: 0,
      price_type: 'free',
      allow_download: true,
      is_published: true,
    }) as any),
  );
  await supabase.from('decks').update({ is_public: true } as any).in('id', newIds);
}

/** Remove a turma member. */
export async function removeTurmaMember(turmaId: string, userId: string) {
  const { error } = await supabase
    .from('turma_members')
    .delete()
    .eq('turma_id', turmaId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Ensure a turma has a share_slug; generates one if missing. Returns the slug. */
export async function ensureShareSlug(turmaId: string): Promise<string> {
  const { data } = await supabase.from('turmas').select('share_slug').eq('id', turmaId).single();
  if ((data as any)?.share_slug) return (data as any).share_slug;
  const generated = turmaId.substring(0, 8);
  await supabase.from('turmas').update({ share_slug: generated } as any).eq('id', turmaId);
  return generated;
}
