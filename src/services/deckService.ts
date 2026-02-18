/**
 * Service layer for Deck-related backend operations.
 * Abstracts all Supabase interactions for decks and cards.
 */

import { supabase } from '@/integrations/supabase/client';
import type { DeckWithStats } from '@/types/deck';

/** Fetch all user decks with computed stats using batch RPC (single query). */
export async function fetchDecksWithStats(userId: string): Promise<DeckWithStats[]> {
  const { data: decks, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Batch stats: single RPC call instead of N+1
  const { data: allStats } = await supabase.rpc('get_all_user_deck_stats', { p_user_id: userId });
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

  // Batch source author lookup (only for decks with source_listing_id)
  const listingIds = (decks || []).map((d: any) => d.source_listing_id).filter(Boolean);
  const authorMap = new Map<string, string | null>();
  if (listingIds.length > 0) {
    const { data: listings } = await supabase
      .from('marketplace_listings')
      .select('id, seller_id')
      .in('id', listingIds);
    if (listings && listings.length > 0) {
      const sellerIds = [...new Set(listings.map((l: any) => l.seller_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', sellerIds);
      const profileMap = new Map<string, string>();
      if (profiles) for (const p of profiles as any[]) profileMap.set(p.id, p.name);
      for (const l of listings as any[]) {
        authorMap.set(l.id, profileMap.get(l.seller_id) || null);
      }
    }
  }

  return (decks || []).map((deck: any) => {
    const s = statsMap.get(deck.id) ?? { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };
    const dailyNewLimit = deck.daily_new_limit ?? 20;
    const dailyReviewLimit = deck.daily_review_limit ?? 100;
    return {
      ...deck,
      folder_id: deck.folder_id ?? null,
      parent_deck_id: deck.parent_deck_id ?? null,
      is_archived: deck.is_archived ?? false,
      new_count: Math.max(0, Math.min(s.new_count, dailyNewLimit - s.new_reviewed_today)),
      learning_count: s.learning_count,
      review_count: Math.min(s.review_count, Math.max(0, dailyReviewLimit - (s.reviewed_today - s.new_graduated_today))),
      reviewed_today: s.reviewed_today,
      new_reviewed_today: s.new_reviewed_today,
      new_graduated_today: s.new_graduated_today,
      daily_new_limit: dailyNewLimit,
      daily_review_limit: dailyReviewLimit,
      source_listing_id: deck.source_listing_id ?? null,
      source_author: deck.source_listing_id ? (authorMap.get(deck.source_listing_id) ?? null) : null,
      source_turma_deck_id: (deck as any).source_turma_deck_id ?? null,
    };
  });
}

/** Resolve a unique deck name by appending (1), (2), etc. if needed. */
export async function resolveUniqueDeckName(userId: string, baseName: string): Promise<string> {
  const { data } = await supabase
    .from('decks')
    .select('name')
    .eq('user_id', userId)
    .ilike('name', `${baseName}%`);
  if (!data || data.length === 0) return baseName;
  const existing = new Set(data.map((d: any) => d.name));
  if (!existing.has(baseName)) return baseName;
  let i = 1;
  while (existing.has(`${baseName} (${i})`)) i++;
  return `${baseName} (${i})`;
}

/** Create a new deck. */
export async function createDeck(userId: string, name: string, folderId?: string | null, parentDeckId?: string | null, algorithmMode?: string) {
  const { data, error } = await supabase
    .from('decks')
    .insert({ name, user_id: userId, folder_id: folderId ?? null, parent_deck_id: parentDeckId ?? null, ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}) } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a deck by ID. */
export async function deleteDeck(id: string) {
  const { error } = await supabase.from('decks').delete().eq('id', id);
  if (error) throw error;
}

/** Delete a deck and all sub-decks/cards via backend RPC. */
export async function deleteDeckCascade(deckId: string) {
  const { error } = await supabase.rpc('delete_deck_cascade', { p_deck_id: deckId });
  if (error) throw error;
}

/** Delete a folder and all contents via backend RPC. */
export async function deleteFolderCascade(folderId: string) {
  const { error } = await supabase.rpc('delete_folder_cascade', { p_folder_id: folderId });
  if (error) throw error;
}

/** Rename a deck. */
export async function renameDeck(id: string, name: string) {
  const { error } = await supabase.from('decks').update({ name } as any).eq('id', id);
  if (error) throw error;
}

/** Move a deck to a different folder. */
export async function moveDeck(id: string, folderId: string | null) {
  const { error } = await supabase.from('decks').update({ folder_id: folderId } as any).eq('id', id);
  if (error) throw error;
}

/** Bulk move decks to a folder. */
export async function bulkMoveDecks(ids: string[], folderId: string | null) {
  const { error } = await supabase.from('decks').update({ folder_id: folderId } as any).in('id', ids);
  if (error) throw error;
}

/** Bulk archive decks. */
export async function bulkArchiveDecks(ids: string[]) {
  const { error } = await supabase.from('decks').update({ is_archived: true } as any).in('id', ids);
  if (error) throw error;
}

/** Bulk delete decks using cascade RPC to handle FK constraints. */
export async function bulkDeleteDecks(ids: string[]) {
  for (const id of ids) {
    const { error } = await supabase.rpc('delete_deck_cascade', { p_deck_id: id });
    if (error) throw error;
  }
}

/** Fetch a single deck by ID. */
export async function fetchDeck(deckId: string) {
  const { data, error } = await supabase.from('decks').select('*').eq('id', deckId).single();
  if (error) throw error;
  return data;
}

/** Change algorithm mode for a deck and optionally reset progress. */
export async function changeAlgorithm(deckId: string, algorithmMode: string, forceReset = true) {
  const { error: deckErr } = await supabase.from('decks').update({ algorithm_mode: algorithmMode } as any).eq('id', deckId);
  if (deckErr) throw deckErr;

  if (forceReset) {
    const { error: cardErr } = await supabase.from('cards').update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any).eq('deck_id', deckId);
    if (cardErr) throw cardErr;
  }

  // Propagate to child decks
  const { data: children } = await supabase.from('decks').select('id').eq('parent_deck_id', deckId);
  if (children && children.length > 0) {
    const childIds = children.map(c => c.id);
    await supabase.from('decks').update({ algorithm_mode: algorithmMode } as any).in('id', childIds);
    if (forceReset) {
      await supabase.from('cards').update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any).in('deck_id', childIds);
    }
  }
  return { childCount: children?.length ?? 0, shouldReset: forceReset };
}

/** Create a copy of a deck with a different algorithm as a sub-deck. */
export async function createAlgorithmCopy(userId: string, deckId: string, algorithmMode: string, algorithmLabel: string) {
  const { data: currentDeck } = await supabase.from('decks').select('*').eq('id', deckId).single();
  if (!currentDeck) throw new Error('Deck not found');
  const { data: newDeck, error } = await supabase
    .from('decks')
    .insert({
      name: `${currentDeck.name} (${algorithmLabel})`,
      user_id: userId,
      folder_id: currentDeck.folder_id,
      algorithm_mode: algorithmMode,
      parent_deck_id: deckId,
    } as any)
    .select().single();
  if (error || !newDeck) throw error || new Error('Failed to create deck');
  const { data: cardsToCopy } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', deckId);
  if (cardsToCopy && cardsToCopy.length > 0) {
    await supabase.from('cards').insert(
      cardsToCopy.map((c: any) => ({
        deck_id: (newDeck as any).id,
        front_content: c.front_content,
        back_content: c.back_content,
        card_type: c.card_type ?? 'basic',
      })) as any
    );
  }
  return newDeck;
}

/** Import a deck with cards. Returns the new deck. */
export async function importDeck(userId: string, name: string, folderId: string | null, cards: { frontContent: string; backContent: string; cardType: string }[], algorithmMode?: string) {
  const { data: newDeck, error: deckErr } = await supabase
    .from('decks')
    .insert({ name, user_id: userId, folder_id: folderId, ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}) } as any)
    .select()
    .single();
  if (deckErr || !newDeck) throw deckErr;
  
  const rows = cards.map(c => ({
    deck_id: (newDeck as any).id,
    front_content: c.frontContent,
    back_content: c.backContent,
    card_type: c.cardType,
  }));
  const { error: cardsErr } = await supabase.from('cards').insert(rows as any);
  if (cardsErr) throw cardsErr;
  
  return newDeck;
}

/** Recursive subdeck type for N-level hierarchy */
interface SubdeckNode {
  name: string;
  card_indices: number[];
  children?: SubdeckNode[];
}

/** Import a deck organized into subdecks. Supports recursive hierarchy (up to N levels). */
export async function importDeckWithSubdecks(
  userId: string,
  parentName: string,
  folderId: string | null,
  cards: { frontContent: string; backContent: string; cardType: string }[],
  subdecks: SubdeckNode[],
  algorithmMode?: string,
) {
  const hasHierarchy = subdecks.some(sd => sd.children && sd.children.length > 0);
  const multipleTopLevel = subdecks.length > 1 && hasHierarchy;

  // Helper to insert cards for a deck
  const insertCards = async (deckId: string, indices: number[]) => {
    const validCards = indices
      .filter(idx => idx >= 0 && idx < cards.length)
      .map(idx => ({
        deck_id: deckId,
        front_content: cards[idx].frontContent,
        back_content: cards[idx].backContent,
        card_type: cards[idx].cardType,
      }));
    if (validCards.length > 0) {
      const { error } = await supabase.from('cards').insert(validCards as any);
      if (error) throw error;
    }
  };

  // Recursive helper to create a deck tree
  const createDeckTree = async (
    node: SubdeckNode,
    parentDeckId: string | null,
    nodeFolderId: string | null,
  ) => {
    const { data: deck, error } = await supabase
      .from('decks')
      .insert({
        name: node.name,
        user_id: userId,
        folder_id: nodeFolderId,
        parent_deck_id: parentDeckId,
        ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}),
      } as any)
      .select()
      .single();
    if (error || !deck) throw error;

    const deckId = (deck as any).id;

    if (!node.children || node.children.length === 0) {
      await insertCards(deckId, node.card_indices);
    } else {
      // Recursively create children
      for (const child of node.children) {
        await createDeckTree(child, deckId, nodeFolderId);
      }
    }

    return deck;
  };

  if (multipleTopLevel) {
    const createdDecks = [];
    for (const sd of subdecks) {
      const deck = await createDeckTree(sd, null, folderId);
      createdDecks.push(deck);
    }
    return createdDecks[0];
  } else {
    const { data: parentDeck, error: parentErr } = await supabase
      .from('decks')
      .insert({
        name: parentName,
        user_id: userId,
        folder_id: folderId,
        ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}),
      } as any)
      .select()
      .single();
    if (parentErr || !parentDeck) throw parentErr;

    const parentId = (parentDeck as any).id;

    for (const sd of subdecks) {
      await createDeckTree(sd, parentId, folderId);
    }

    return parentDeck;
  }
}

/** Get turma navigation info for a turma deck. */
export async function getTurmaDeckNavInfo(turmaDeckId: string): Promise<{ turma_id: string; lesson_id: string | null } | null> {
  const { data } = await supabase.from('turma_decks').select('turma_id, lesson_id').eq('id', turmaDeckId).single();
  return data as any ?? null;
}

/** Toggle archive status of a deck and propagate to sub-decks. */
export async function archiveDeck(id: string) {
  const { data: deck } = await supabase.from('decks').select('is_archived').eq('id', id).single();
  const newArchived = !(deck?.is_archived);
  const { error } = await supabase.from('decks').update({ is_archived: newArchived } as any).eq('id', id);
  if (error) throw error;
  // Propagate to sub-decks
  const { data: children } = await supabase.from('decks').select('id').eq('parent_deck_id', id);
  if (children && children.length > 0) {
    await supabase.from('decks').update({ is_archived: newArchived } as any).in('id', children.map(c => c.id));
  }
}

/** Duplicate a deck and its cards. */
export async function duplicateDeck(userId: string, id: string) {
  const { data: deck } = await supabase.from('decks').select('*').eq('id', id).single();
  if (!deck) throw new Error('Deck not found');

  const { data: newDeck, error } = await supabase
    .from('decks')
    .insert({ name: `${(deck as any).name} (cópia)`, user_id: userId, folder_id: (deck as any).folder_id } as any)
    .select()
    .single();
  if (error) throw error;

  const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', id);
  if (cards && cards.length > 0 && newDeck) {
    const newCards = cards.map((c: any) => ({
      deck_id: (newDeck as any).id,
      front_content: c.front_content,
      back_content: c.back_content,
      card_type: c.card_type ?? 'basic',
    }));
    await supabase.from('cards').insert(newCards as any);
  }
  return newDeck;
}

/** Batch-update sort_order for a list of deck IDs. */
export async function reorderDecks(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('decks').update({ sort_order: i } as any).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

/** Reset all card progress in a deck. */
export async function resetDeckProgress(deckId: string) {
  const { error } = await supabase
    .from('cards')
    .update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any)
    .eq('deck_id', deckId);
  if (error) throw error;
}
