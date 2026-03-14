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
    const { data: owned } = await supabase.from('turmas').select('*').eq('owner_id', userId);
    turmas = owned ?? [];
  } else {
    const turmaIds = memberships.map(m => (m as any).turma_id);
    const { data } = await supabase
      .from('turmas').select('*').or(`id.in.(${turmaIds.join(',')}),owner_id.eq.${userId}`);
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
  const { data } = await supabase.from('turmas').select('*').eq('id', turmaId).single();
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
  const { data } = await supabase.from('turmas').select('*').eq('share_slug', slug).single();
  return data as Turma | null;
}

// ── Discover ──

export async function fetchDiscoverTurmas(userId: string, searchQuery: string): Promise<(Turma & { member_count: number; owner_name: string })[]> {
  let query = supabase.from('turmas').select('*').eq('is_private', false);
  const q = searchQuery.trim();
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  const { data: turmas } = await query.order('created_at', { ascending: false }).limit(50);
  
  let tagMatchedTurmaIds = new Set<string>();
  if (q) {
    const { data: matchingTags } = await supabase.from('tags').select('id').ilike('name', `%${q}%`);
    if (matchingTags && matchingTags.length > 0) {
      const tagIds = matchingTags.map((t: any) => t.id);
      const { data: deckTagRows } = await supabase.from('deck_tags').select('deck_id').in('tag_id', tagIds);
      if (deckTagRows && deckTagRows.length > 0) {
        const deckIds = deckTagRows.map((r: any) => r.deck_id);
        const { data: decksWithCommunity } = await supabase.from('decks').select('community_id').in('id', deckIds).not('community_id', 'is', null);
        (decksWithCommunity ?? []).forEach((d: any) => { if (d.community_id) tagMatchedTurmaIds.add(d.community_id); });
      }
    }
  }

  const nameMatchedIds = new Set((turmas ?? []).map((t: any) => t.id));
  const extraIds = [...tagMatchedTurmaIds].filter(id => !nameMatchedIds.has(id));
  let allTurmas = [...(turmas ?? [])];
  if (extraIds.length > 0) {
    const { data: extraTurmas } = await supabase.from('turmas').select('*').eq('is_private', false).in('id', extraIds.slice(0, 50));
    if (extraTurmas) allTurmas.push(...extraTurmas);
  }

  if (allTurmas.length === 0) return [];

  const ownerIds = [...new Set(allTurmas.map((t: any) => t.owner_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  const turmaIds = allTurmas.map((t: any) => t.id);
  const { data: members } = await supabase.from('turma_members').select('turma_id').in('turma_id', turmaIds);
  const countMap = new Map<string, number>();
  (members ?? []).forEach((m: any) => countMap.set(m.turma_id, (countMap.get(m.turma_id) ?? 0) + 1));

  // Fetch total card counts per turma
  const { data: turmaDecks } = await supabase
    .from('turma_decks')
    .select('turma_id, deck_id')
    .in('turma_id', turmaIds)
    .eq('is_published', true);
  const allDeckIds = (turmaDecks ?? []).map((td: any) => td.deck_id);
  let cardCountMap = new Map<string, number>();
  if (allDeckIds.length > 0) {
    const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
    const deckCardMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));
    (turmaDecks ?? []).forEach((td: any) => {
      const cards = deckCardMap.get(td.deck_id) ?? 0;
      cardCountMap.set(td.turma_id, (cardCountMap.get(td.turma_id) ?? 0) + cards);
    });
  }

  return allTurmas.map((t: any) => ({
    ...t, member_count: countMap.get(t.id) ?? 0, card_count: cardCountMap.get(t.id) ?? 0,
    owner_name: profileMap.get(t.owner_id) ?? 'Anônimo',
    avg_rating: t.avg_rating ?? 0, rating_count: t.rating_count ?? 0,
  }));
}

// ── Public Decks Discovery ──

export interface PublicDeckItem {
  id: string;
  name: string;
  card_count: number;
  owner_name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export async function fetchPublicDecks(searchQuery: string): Promise<PublicDeckItem[]> {
  let query = supabase.from('decks').select('id, name, user_id, parent_deck_id, created_at, updated_at').eq('is_public', true);
  const q = searchQuery.trim();
  if (q) query = query.ilike('name', `%${q}%`);
  const { data: decks } = await query.order('created_at', { ascending: false }).limit(200);

  let tagMatchedDeckIds = new Set<string>();
  if (q) {
    const { data: matchingTags } = await supabase.from('tags').select('id').ilike('name', `%${q}%`);
    if (matchingTags && matchingTags.length > 0) {
      const tagIds = matchingTags.map((t: any) => t.id);
      const { data: deckTagRows } = await supabase.from('deck_tags').select('deck_id').in('tag_id', tagIds);
      (deckTagRows ?? []).forEach((r: any) => tagMatchedDeckIds.add(r.deck_id));
      const { data: cardTagRows } = await supabase.from('card_tags').select('card_id').in('tag_id', tagIds);
      if (cardTagRows && cardTagRows.length > 0) {
        const cardIds = cardTagRows.map((r: any) => r.card_id);
        const { data: cards } = await supabase.from('cards').select('deck_id').in('id', cardIds.slice(0, 500));
        (cards ?? []).forEach((c: any) => tagMatchedDeckIds.add(c.deck_id));
      }
    }
  }

  const nameMatchedIds = new Set((decks ?? []).map((d: any) => d.id));
  const extraIds = [...tagMatchedDeckIds].filter(id => !nameMatchedIds.has(id));

  let allDecks = [...(decks ?? [])];
  if (extraIds.length > 0) {
    const { data: extraDecks } = await supabase.from('decks')
      .select('id, name, user_id, parent_deck_id, created_at, updated_at')
      .eq('is_public', true)
      .in('id', extraIds.slice(0, 100));
    if (extraDecks) allDecks.push(...extraDecks);
  }

  if (allDecks.length === 0) return [];

  const ownerIds = [...new Set(allDecks.map((d: any) => d.user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  const childrenMap = new Map<string, string[]>();
  const deckMap = new Map(allDecks.map((d: any) => [d.id, d]));
  allDecks.forEach((d: any) => {
    if (d.parent_deck_id && deckMap.has(d.parent_deck_id)) {
      const list = childrenMap.get(d.parent_deck_id) ?? [];
      list.push(d.id);
      childrenMap.set(d.parent_deck_id, list);
    }
  });

  const allFetchedIds = new Set(allDecks.map((d: any) => d.id));
  let parentIds = [...allFetchedIds];
  while (parentIds.length > 0) {
    const { data: children } = await supabase.from('decks').select('id, parent_deck_id, updated_at').in('parent_deck_id', parentIds);
    const newChildren = (children ?? []).filter((c: any) => !allFetchedIds.has(c.id));
    if (newChildren.length === 0) break;
    newChildren.forEach((c: any) => {
      allFetchedIds.add(c.id);
      const list = childrenMap.get(c.parent_deck_id) ?? [];
      list.push(c.id);
      childrenMap.set(c.parent_deck_id, list);
    });
    parentIds = newChildren.map((c: any) => c.id);
  }

  const allDeckIds = [...allFetchedIds];
  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
  const directCountMap = new Map<string, number>();
  (countRows ?? []).forEach((r: any) => directCountMap.set(r.deck_id, Number(r.card_count)));

  const collectSubtreeCount = (id: string): number => {
    let count = directCountMap.get(id) ?? 0;
    for (const childId of (childrenMap.get(id) ?? [])) {
      count += collectSubtreeCount(childId);
    }
    return count;
  };

  return allDecks
    .filter((d: any) => !d.parent_deck_id)
    .map((d: any) => ({
      id: d.id,
      name: d.name,
      card_count: collectSubtreeCount(d.id),
      owner_name: profileMap.get(d.user_id) ?? 'Anônimo',
      owner_id: d.user_id,
      created_at: d.created_at,
      updated_at: d.updated_at,
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
