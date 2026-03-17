/**
 * Deck CRUD operations.
 * Extracted from deckService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';

const DECK_ALL_COLS = 'id, name, parent_deck_id, folder_id, user_id, daily_new_limit, daily_review_limit, algorithm_mode, learning_steps, requested_retention, max_interval, interval_modifier, easy_bonus, easy_graduating_interval, shuffle_cards, is_live_deck, source_turma_deck_id, source_listing_id, bury_siblings, bury_new_siblings, bury_review_siblings, bury_learning_siblings, is_archived, is_public, is_free_in_community, community_id, sort_order, allow_duplication, synced_at, created_at, updated_at' as const;

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

/** Move a deck to a different folder and/or parent deck. */
export async function moveDeck(id: string, folderId: string | null, parentDeckId?: string | null) {
  const { error } = await supabase.from('decks').update({
    folder_id: folderId,
    parent_deck_id: parentDeckId ?? null,
  } as any).eq('id', id);
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
  // Use bulk RPC if available, fallback to sequential
  try {
    const { error } = await supabase.rpc('bulk_delete_decks_cascade' as any, { p_deck_ids: ids } as any);
    if (error) throw error;
  } catch {
    // Fallback: sequential delete
    for (const id of ids) {
      const { error } = await supabase.rpc('delete_deck_cascade', { p_deck_id: id });
      if (error) throw error;
    }
  }
}

/** Fetch a single deck by ID. */
export async function fetchDeck(deckId: string) {
  const { data, error } = await supabase.from('decks').select(DECK_ALL_COLS).eq('id', deckId).single();
  if (error) throw error;
  return data;
}

/** Update deck fields by ID. */
export async function updateDeck(deckId: string, updates: Record<string, unknown>) {
  const { error } = await supabase.from('decks').update(updates as any).eq('id', deckId);
  if (error) throw error;
}

/** Change algorithm mode for a deck and optionally reset progress. */
export async function changeAlgorithm(deckId: string, algorithmMode: string, forceReset = true) {
  const { error: deckErr } = await supabase.from('decks').update({ algorithm_mode: algorithmMode } as any).eq('id', deckId);
  if (deckErr) throw deckErr;

  if (forceReset) {
    const { error: cardErr } = await supabase.from('cards').update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any).eq('deck_id', deckId);
    if (cardErr) throw cardErr;
  }

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
  const { data: currentDeck } = await supabase.from('decks').select('name, folder_id').eq('id', deckId).single();
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
  const { data: children } = await supabase.from('decks').select('id').eq('parent_deck_id', id);
  if (children && children.length > 0) {
    await supabase.from('decks').update({ is_archived: newArchived } as any).in('id', children.map(c => c.id));
  }
}

/** Duplicate a deck and its cards. */
export async function duplicateDeck(userId: string, id: string) {
  const { data: deck } = await supabase.from('decks').select('name, folder_id').eq('id', id).single();
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

/** Create an independent copy of a community deck (detach). */
export async function detachCommunityDeck(userId: string, sourceDeckId: string) {
  const { data: originalDeck } = await supabase.from('decks').select('name').eq('id', sourceDeckId).single();
  if (!originalDeck) throw new Error('Deck not found');

  const { data: newDeck, error } = await supabase
    .from('decks')
    .insert({ name: (originalDeck as any).name, user_id: userId } as any)
    .select()
    .single();
  if (error || !newDeck) throw error || new Error('Failed to create deck');

  const { data: cards } = await supabase
    .from('cards')
    .select('front_content, back_content, card_type')
    .eq('deck_id', sourceDeckId);
  if (cards && cards.length > 0) {
    await supabase.from('cards').insert(
      cards.map((c: any) => ({
        deck_id: (newDeck as any).id,
        front_content: c.front_content,
        back_content: c.back_content,
        card_type: c.card_type ?? 'basic',
      })) as any,
    );
  }
  return newDeck;
}

/** Batch-update sort_order for a list of deck IDs. */
export async function reorderDecks(orderedIds: string[]) {
  const { error } = await supabase.rpc('batch_reorder_decks', { p_deck_ids: orderedIds });
  if (error) throw error;
}

/** Reset all card progress in a deck and all its descendants. */
export async function resetDeckProgress(deckId: string) {
  const { data: allDecks, error: decksError } = await supabase
    .from('decks')
    .select('id, parent_deck_id')
    .eq('user_id', (await supabase.auth.getUser()).data.user!.id);
  if (decksError) throw decksError;

  const deckIds = [deckId];
  const queue = [deckId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const children = (allDecks || []).filter(d => d.parent_deck_id === current);
    for (const child of children) {
      deckIds.push(child.id);
      queue.push(child.id);
    }
  }

  const { data: cards, error: cardsError } = await supabase
    .from('cards')
    .select('id')
    .in('deck_id', deckIds);
  if (cardsError) throw cardsError;

  const cardIds = (cards || []).map(c => c.id);

  if (cardIds.length > 0) {
    for (let i = 0; i < cardIds.length; i += 500) {
      const batch = cardIds.slice(i, i + 500);
      const { error: logError } = await supabase
        .from('review_logs')
        .delete()
        .in('card_id', batch);
      if (logError) throw logError;
    }
  }

  const { error } = await supabase
    .from('cards')
    .update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any)
    .in('deck_id', deckIds);
  if (error) throw error;
}
