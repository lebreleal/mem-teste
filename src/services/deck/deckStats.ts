/**
 * Deck statistics queries (CQRS Read side).
 * Extracted from deckService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import { TZ_OFFSET_SP } from '@/lib/dateUtils';
import type { DeckWithStats } from '@/types/deck';

/** Fetch all user decks with computed stats using batch RPC (single query). */
export async function fetchDecksWithStats(userId: string): Promise<DeckWithStats[]> {
  const fetchAllDecks = async () => {
    const PAGE = 1000;
    let allDecks: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('decks')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (data) allDecks = allDecks.concat(data);
      hasMore = (data?.length ?? 0) === PAGE;
      offset += PAGE;
    }
    return allDecks;
  };

  const [decks, statsResult, cardCountsResult] = await Promise.all([
    fetchAllDecks(),
    supabase.rpc('get_all_user_deck_stats', { p_user_id: userId, p_tz_offset_minutes: TZ_OFFSET_SP }),
    supabase.rpc('get_all_user_card_counts' as any, { p_user_id: userId }),
  ]);

  const allStats = statsResult.data;
  const statsMap = new Map<string, { new_count: number; learning_count: number; review_count: number; reviewed_today: number; new_reviewed_today: number; new_graduated_today: number }>();
  if (allStats) {
    for (const s of allStats as any[]) {
      statsMap.set(s.deck_id, {
        new_count: s.new_count, learning_count: s.learning_count,
        review_count: s.review_count, reviewed_today: s.reviewed_today ?? 0,
        new_reviewed_today: s.new_reviewed_today ?? 0, new_graduated_today: s.new_graduated_today ?? 0,
      });
    }
  }

  // ── Card counts from server-side RPC (single query) ──
  const cardCountMap = new Map<string, { total: number; mastered: number; novo: number; facil: number; bom: number; dificil: number; errei: number }>();
  if (cardCountsResult.data) {
    for (const r of cardCountsResult.data as any[]) {
      cardCountMap.set(r.deck_id, {
        total: Number(r.total), mastered: Number(r.mastered),
        novo: Number(r.novo), facil: Number(r.facil),
        bom: Number(r.bom), dificil: Number(r.dificil), errei: Number(r.errei),
      });
    }
  }

  // ── 1. Author via marketplace listing ──
  const listingIds = (decks || []).map((d: any) => d.source_listing_id).filter(Boolean);
  const authorMap = new Map<string, string | null>();
  if (listingIds.length > 0) {
    const { data: listings } = await supabase
      .from('marketplace_listings')
      .select('id, seller_id')
      .in('id', listingIds);
    if (listings && listings.length > 0) {
      const sellerIds = [...new Set(listings.map((l: any) => l.seller_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sellerIds);
      const profileMap = new Map<string, string>();
      if (profiles) for (const p of profiles as any[]) profileMap.set(p.id, p.name);
      for (const l of listings as any[]) {
        authorMap.set(l.id, profileMap.get(l.seller_id) || null);
      }
    }
  }

  // ── 2. Author via turma_decks.shared_by + source deck updated_at ──
  const turmaDecksIds = (decks || []).map((d: any) => d.source_turma_deck_id).filter(Boolean);
  const turmaAuthorMap = new Map<string, string | null>();
  const sourceUpdatedAtMap = new Map<string, string>();
  if (turmaDecksIds.length > 0) {
    const { data: turmaDecks } = await supabase
      .from('turma_decks')
      .select('id, shared_by, deck_id')
      .in('id', turmaDecksIds);
    if (turmaDecks && turmaDecks.length > 0) {
      // Resolve sharer names
      const sharerIds = [...new Set(turmaDecks.map((td: any) => td.shared_by))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sharerIds);
      const profileMap = new Map<string, string>();
      if (profiles) for (const p of profiles as any[]) profileMap.set(p.id, p.name);
      for (const td of turmaDecks as any[]) {
        turmaAuthorMap.set(td.id, profileMap.get(td.shared_by) || null);
      }
      // Resolve source deck updated_at
      const sourceDeckIds = [...new Set(turmaDecks.map((td: any) => td.deck_id))];
      const { data: sourceDecks } = await supabase.from('decks').select('id, updated_at').in('id', sourceDeckIds);
      const srcMap = new Map<string, string>();
      if (sourceDecks) for (const sd of sourceDecks as any[]) srcMap.set(sd.id, sd.updated_at);
      for (const td of turmaDecks as any[]) {
        const ts = srcMap.get(td.deck_id);
        if (ts) sourceUpdatedAtMap.set(td.id, ts);
      }
    }
  }

  // ── 3. For is_live_deck orphans (no source_turma_deck_id, no source_listing_id),
  //       find the original public deck by name and resolve author + updated_at ──
  const orphanLiveDecks = (decks || []).filter(
    (d: any) => d.is_live_deck && !d.source_turma_deck_id && !d.source_listing_id
  );
  // Map: orphan deck name → { author, updated_at }
  const orphanAuthorMap = new Map<string, { author: string | null; updatedAt: string | null }>();
  if (orphanLiveDecks.length > 0) {
    const orphanNames = [...new Set(orphanLiveDecks.map((d: any) => d.name))];
    // Find original public decks with those names NOT owned by this user
    const { data: originals } = await supabase
      .from('decks')
      .select('name, user_id, updated_at')
      .in('name', orphanNames)
      .neq('user_id', userId)
      .eq('is_live_deck', false);
    if (originals && originals.length > 0) {
      const ownerIds = [...new Set(originals.map((o: any) => o.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ownerIds);
      const profileMap = new Map<string, string>();
      if (profiles) for (const p of profiles as any[]) profileMap.set(p.id, p.name);
      // Use the first match per name
      for (const o of originals as any[]) {
        if (!orphanAuthorMap.has(o.name)) {
          orphanAuthorMap.set(o.name, {
            author: profileMap.get(o.user_id) || null,
            updatedAt: o.updated_at,
          });
        }
      }
    }
  }

  return (decks || []).map((deck: any) => {
    const s = statsMap.get(deck.id) ?? { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };

    // Resolve author with priority chain
    let resolvedAuthor: string | null = null;
    if (deck.source_listing_id) {
      resolvedAuthor = authorMap.get(deck.source_listing_id) ?? null;
    }
    if (!resolvedAuthor && deck.source_turma_deck_id) {
      resolvedAuthor = turmaAuthorMap.get(deck.source_turma_deck_id) ?? null;
    }
    // Fallback for orphan live decks: use original deck owner
    if (!resolvedAuthor && deck.is_live_deck) {
      resolvedAuthor = orphanAuthorMap.get(deck.name)?.author ?? null;
    }

    // Resolve source updated_at
    let sourceUpdatedAt: string | null = null;
    if (deck.source_turma_deck_id) {
      sourceUpdatedAt = sourceUpdatedAtMap.get(deck.source_turma_deck_id) ?? null;
    }
    if (!sourceUpdatedAt && deck.is_live_deck) {
      sourceUpdatedAt = orphanAuthorMap.get(deck.name)?.updatedAt ?? null;
    }

    return {
      ...deck,
      folder_id: deck.folder_id ?? null,
      parent_deck_id: deck.parent_deck_id ?? null,
      is_archived: deck.is_archived ?? false,
      new_count: s.new_count,
      learning_count: s.learning_count,
      review_count: s.review_count,
      reviewed_today: s.reviewed_today,
      new_reviewed_today: s.new_reviewed_today,
      new_graduated_today: s.new_graduated_today,
      daily_new_limit: deck.daily_new_limit ?? 20,
      daily_review_limit: deck.daily_review_limit ?? 100,
      source_listing_id: deck.source_listing_id ?? null,
      source_author: resolvedAuthor,
      source_turma_deck_id: (deck as any).source_turma_deck_id ?? null,
      community_id: (deck as any).community_id ?? null,
      updated_at: deck.updated_at ?? deck.created_at,
      source_updated_at: sourceUpdatedAt,
      total_cards: cardCountMap.get(deck.id)?.total ?? 0,
      mastered_cards: cardCountMap.get(deck.id)?.mastered ?? 0,
      class_novo: cardCountMap.get(deck.id)?.novo ?? 0,
      class_facil: cardCountMap.get(deck.id)?.facil ?? 0,
      class_bom: cardCountMap.get(deck.id)?.bom ?? 0,
      class_dificil: cardCountMap.get(deck.id)?.dificil ?? 0,
      class_errei: cardCountMap.get(deck.id)?.errei ?? 0,
    };
  });
}