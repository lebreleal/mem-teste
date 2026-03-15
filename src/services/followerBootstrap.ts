/**
 * Service for bootstrapping follower deck copies and incremental sync.
 * When a user follows a sala, this creates local deck/card mirrors.
 * On subsequent visits, syncs any new cards from the owner.
 *
 * Optimized: uses batch .in() queries instead of N+1 pattern.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Bootstrap local deck copies for a follower.
 * Creates mirror decks + copies cards with state=0.
 * Idempotent — skips decks that already exist locally.
 */
export async function bootstrapFollowerDecks(
  userId: string,
  turmaId: string,
  folderId: string
): Promise<{ decks_created: number; cards_created: number }> {
  const { data, error } = await supabase.rpc('bootstrap_follower_decks' as any, {
    p_user_id: userId,
    p_turma_id: turmaId,
    p_folder_id: folderId,
  });
  if (error) {
    console.error('[bootstrapFollowerDecks] Error:', error);
    throw error;
  }
  return (data as any) ?? { decks_created: 0, cards_created: 0 };
}

/**
 * Incremental sync: copy new cards from owner's decks to follower's local mirrors.
 * BATCH approach: fetches all turma_deck mappings, existing cards, and source cards
 * in 3 fixed queries instead of N+1.
 */
export async function syncFollowerDecks(userId: string, folderId: string): Promise<number> {
  const PAGE = 1000;

  // 1. Get all local mirror decks in this folder (with source_turma_deck_id)
  const { data: localDecks } = await supabase
    .from('decks')
    .select('id, source_turma_deck_id, parent_deck_id, name')
    .eq('user_id', userId)
    .eq('folder_id', folderId)
    .eq('is_archived', false);

  if (!localDecks || localDecks.length === 0) return 0;

  // Filter to decks that have a source_turma_deck_id
  const mirrorDecks = localDecks.filter((d: any) => d.source_turma_deck_id);
  if (mirrorDecks.length === 0) return 0;

  // 2. BATCH: fetch all turma_deck → source deck_id mappings in ONE query
  const allSourceTurmaDeckIds = mirrorDecks.map((d: any) => d.source_turma_deck_id);
  const { data: turmaDeckRows } = await supabase
    .from('turma_decks')
    .select('id, deck_id')
    .in('id', allSourceTurmaDeckIds);

  if (!turmaDeckRows || turmaDeckRows.length === 0) return 0;

  const turmaDeckMap = new Map<string, string>(); // turma_deck_id → source deck_id
  for (const td of turmaDeckRows as any[]) {
    turmaDeckMap.set(td.id, td.deck_id);
  }

  // Build sync pairs: { localDeckId, sourceDeckId }
  type SyncPair = { localDeckId: string; sourceDeckId: string };
  const syncPairs: SyncPair[] = [];
  const allProcessedDeckIds: string[] = [];

  for (const localDeck of mirrorDecks) {
    const sourceDeckId = turmaDeckMap.get((localDeck as any).source_turma_deck_id);
    if (!sourceDeckId) continue;

    syncPairs.push({ localDeckId: localDeck.id, sourceDeckId });
    allProcessedDeckIds.push(localDeck.id);
  }

  if (syncPairs.length === 0) return 0;

  // 3. Fetch source sub-decks in batch
  const allSourceDeckIds = syncPairs.map(p => p.sourceDeckId);
  const { data: sourceSubDecks } = await supabase
    .from('decks')
    .select('id, name, parent_deck_id')
    .in('parent_deck_id', allSourceDeckIds);

  // For each source deck, add sub-deck sync pairs
  if (sourceSubDecks && sourceSubDecks.length > 0) {
    // Get local sub-decks in batch
    const localRootIds = mirrorDecks.map(d => d.id);
    const { data: localSubDecks } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id')
      .eq('user_id', userId)
      .in('parent_deck_id', localRootIds);

    const localSubMap = new Map<string, Map<string, string>>(); // parentId → Map<name, id>
    for (const ls of (localSubDecks ?? []) as any[]) {
      if (!localSubMap.has(ls.parent_deck_id)) localSubMap.set(ls.parent_deck_id, new Map());
      localSubMap.get(ls.parent_deck_id)!.set(ls.name, ls.id);
    }

    // Create missing sub-decks and add sync pairs
    for (const srcSub of sourceSubDecks as any[]) {
      // Find the local root that mirrors this source parent
      const mirrorDeck = mirrorDecks.find(
        (m: any) => turmaDeckMap.get(m.source_turma_deck_id) === srcSub.parent_deck_id
      );
      if (!mirrorDeck) continue;

      const nameMap = localSubMap.get(mirrorDeck.id);
      let localSubId = nameMap?.get(srcSub.name);

      if (!localSubId) {
        const { data: newSub } = await supabase
          .from('decks')
          .insert({
            user_id: userId,
            name: srcSub.name,
            folder_id: folderId,
            parent_deck_id: mirrorDeck.id,
            daily_new_limit: 20,
            daily_review_limit: 9999,
          } as any)
          .select('id')
          .single();
        if (newSub) localSubId = (newSub as any).id;
      }

      if (localSubId) {
        syncPairs.push({ localDeckId: localSubId, sourceDeckId: srcSub.id });
        allProcessedDeckIds.push(localSubId);
      }
    }
  }

  // 4. BATCH: fetch all existing origin_deck_ids from local decks
  const allLocalDeckIds = syncPairs.map(p => p.localDeckId);
  const existingOriginsByDeck = new Map<string, Set<string>>();

  for (let i = 0; i < allLocalDeckIds.length; i += 200) {
    const batch = allLocalDeckIds.slice(i, i + 200);
    let offset = 0;
    while (true) {
      const { data: existingBatch } = await supabase
        .from('cards')
        .select('deck_id, origin_deck_id')
        .in('deck_id', batch)
        .not('origin_deck_id', 'is', null)
        .range(offset, offset + PAGE - 1);
      if (!existingBatch || existingBatch.length === 0) break;
      for (const c of existingBatch as any[]) {
        if (!existingOriginsByDeck.has(c.deck_id)) existingOriginsByDeck.set(c.deck_id, new Set());
        existingOriginsByDeck.get(c.deck_id)!.add(c.origin_deck_id);
      }
      if (existingBatch.length < PAGE) break;
      offset += PAGE;
    }
  }

  // 5. BATCH: fetch all source cards
  const allSourceIds = [...new Set(syncPairs.map(p => p.sourceDeckId))];
  const sourceCardsByDeck = new Map<string, any[]>();

  for (let i = 0; i < allSourceIds.length; i += 200) {
    const batch = allSourceIds.slice(i, i + 200);
    let offset = 0;
    while (true) {
      const { data: sourceBatch } = await supabase
        .from('cards')
        .select('id, deck_id, front_content, back_content, card_type')
        .in('deck_id', batch)
        .range(offset, offset + PAGE - 1);
      if (!sourceBatch || sourceBatch.length === 0) break;
      for (const c of sourceBatch as any[]) {
        if (!sourceCardsByDeck.has(c.deck_id)) sourceCardsByDeck.set(c.deck_id, []);
        sourceCardsByDeck.get(c.deck_id)!.push(c);
      }
      if (sourceBatch.length < PAGE) break;
      offset += PAGE;
    }
  }

  // 6. Compute diffs and insert in batch
  let totalNewCards = 0;
  const allInserts: any[] = [];

  for (const pair of syncPairs) {
    const existingOrigins = existingOriginsByDeck.get(pair.localDeckId) ?? new Set();
    const sourceCards = sourceCardsByDeck.get(pair.sourceDeckId) ?? [];
    const newCards = sourceCards.filter((c: any) => !existingOrigins.has(c.id));

    for (const c of newCards) {
      allInserts.push({
        deck_id: pair.localDeckId,
        front_content: c.front_content,
        back_content: c.back_content,
        card_type: c.card_type ?? 'basic',
        origin_deck_id: c.id,
      });
    }
    totalNewCards += newCards.length;
  }

  // Insert all new cards in batches
  for (let i = 0; i < allInserts.length; i += 500) {
    const batch = allInserts.slice(i, i + 500);
    await supabase.from('cards').insert(batch as any);
  }

  // 7. Update synced_at on ALL processed decks
  if (allProcessedDeckIds.length > 0) {
    const now = new Date().toISOString();
    for (let i = 0; i < allProcessedDeckIds.length; i += 200) {
      const batch = allProcessedDeckIds.slice(i, i + 200);
      await supabase
        .from('decks')
        .update({ synced_at: now })
        .in('id', batch);
    }
  }

  return totalNewCards;
}

/**
 * Cleanup: delete local mirrored decks and their cards when leaving a sala.
 * review_logs are NOT deleted (they stay for 30 days).
 */
export async function cleanupFollowerDecks(userId: string, folderId: string): Promise<void> {
  const { data: localDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('folder_id', folderId);

  if (!localDecks || localDecks.length === 0) return;

  const deckIds = localDecks.map((d: any) => d.id);

  const { data: subDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .in('parent_deck_id', deckIds);

  const allDeckIds = [...deckIds, ...(subDecks ?? []).map((d: any) => d.id)];

  for (let i = 0; i < allDeckIds.length; i += 200) {
    const batch = allDeckIds.slice(i, i + 200);
    await supabase.from('cards').delete().in('deck_id', batch);
  }

  if (subDecks && subDecks.length > 0) {
    await supabase.from('decks').delete().in('id', subDecks.map((d: any) => d.id));
  }
  await supabase.from('decks').delete().in('id', deckIds);
}
