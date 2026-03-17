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

/** Resolve the source deck info for a linked (community/marketplace) deck.
 *  Returns sourceDeckId, ownerName, and updatedAt in a single call flow. */
export async function fetchLinkedDeckSource(deck: {
  source_turma_deck_id?: string | null;
  source_listing_id?: string | null;
  is_live_deck?: boolean;
  name?: string;
  user_id?: string;
}): Promise<{ sourceDeckId: string; ownerName: string; updatedAt: string | null } | null> {
  let sourceDeckId: string | null = null;

  if (deck.source_turma_deck_id) {
    const { data: td } = await supabase.from('turma_decks').select('deck_id').eq('id', deck.source_turma_deck_id).maybeSingle();
    if (td?.deck_id) sourceDeckId = td.deck_id;
  }

  if (!sourceDeckId && deck.source_listing_id) {
    const { data: listing } = await supabase.from('marketplace_listings').select('deck_id').eq('id', deck.source_listing_id).maybeSingle();
    if (listing?.deck_id) sourceDeckId = listing.deck_id;
  }

  if (!sourceDeckId && deck.is_live_deck && deck.name && deck.user_id) {
    const { data: original } = await supabase
      .from('decks').select('id')
      .eq('name', deck.name).eq('is_public', true).neq('user_id', deck.user_id)
      .limit(1).maybeSingle();
    if (original?.id) sourceDeckId = original.id;
  }

  if (!sourceDeckId) return null;

  const { data: deckData } = await supabase.from('decks').select('user_id, updated_at').eq('id', sourceDeckId).single();
  if (!deckData) return { sourceDeckId, ownerName: 'Criador', updatedAt: null };

  const { data: profile } = await supabase.from('profiles').select('name').eq('id', deckData.user_id).single();

  return {
    sourceDeckId,
    ownerName: profile?.name ?? 'Criador',
    updatedAt: deckData.updated_at,
  };
}

/** Fetch pending deck suggestions with suggester names. */
export async function fetchPendingSuggestions(deckId: string) {
  const { data } = await supabase
    .from('deck_suggestions')
    .select('id, deck_id, card_id, suggestion_type, suggested_content, suggested_tags, rationale, status, content_status, tags_status, suggester_user_id, moderator_user_id, created_at, updated_at')
    .eq('deck_id', deckId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map((s: any) => s.suggester_user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));
  return data.map((s: any) => ({ ...s, suggester_name: profileMap.get(s.suggester_user_id) ?? 'Anônimo' }));
}
