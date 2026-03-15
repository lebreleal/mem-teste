/**
 * Service for bootstrapping follower deck copies and incremental sync.
 * When a user follows a sala, this creates local deck/card mirrors.
 * On subsequent visits, syncs any new cards from the owner.
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
 * Compares origin_deck_id on follower's cards to find missing ones.
 */
export async function syncFollowerDecks(userId: string, folderId: string): Promise<number> {
  // Get all local mirror decks in this folder (root-level, with source_turma_deck_id)
  const { data: localDecks } = await supabase
    .from('decks')
    .select('id, source_turma_deck_id, parent_deck_id')
    .eq('user_id', userId)
    .eq('folder_id', folderId)
    .eq('is_archived', false);

  if (!localDecks || localDecks.length === 0) return 0;

  let totalNewCards = 0;
  const allProcessedDeckIds: string[] = [];
  const PAGE = 1000;

  for (const localDeck of localDecks) {
    const sourceTurmaDeckId = (localDeck as any).source_turma_deck_id;
    if (!sourceTurmaDeckId) continue;

    // Find the original deck_id from turma_decks
    const { data: td } = await supabase
      .from('turma_decks')
      .select('deck_id')
      .eq('id', sourceTurmaDeckId)
      .single();
    if (!td) continue;

    const sourceDeckId = (td as any).deck_id;

    // Sync root deck
    const rootNew = await _syncCardsBetween(sourceDeckId, localDeck.id);
    totalNewCards += rootNew;
    allProcessedDeckIds.push(localDeck.id);

    // --- Sub-deck sync ---
    // Get source sub-decks
    const { data: sourceSubDecks } = await supabase
      .from('decks')
      .select('id, name')
      .eq('parent_deck_id', sourceDeckId);

    if (sourceSubDecks && sourceSubDecks.length > 0) {
      // Get local sub-decks
      const { data: localSubDecks } = await supabase
        .from('decks')
        .select('id, name, parent_deck_id')
        .eq('parent_deck_id', localDeck.id)
        .eq('user_id', userId);

      const localSubMap = new Map((localSubDecks ?? []).map((d: any) => [d.name, d.id]));

      for (const srcSub of sourceSubDecks) {
        let localSubId = localSubMap.get((srcSub as any).name);

        if (!localSubId) {
          // Create missing local sub-deck
          const { data: newSub } = await supabase
            .from('decks')
            .insert({
              user_id: userId,
              name: (srcSub as any).name,
              folder_id: folderId,
              parent_deck_id: localDeck.id,
              daily_new_limit: 20,
              daily_review_limit: 9999,
            } as any)
            .select('id')
            .single();
          if (newSub) localSubId = (newSub as any).id;
        }

        if (localSubId) {
          const subNew = await _syncCardsBetween((srcSub as any).id, localSubId);
          totalNewCards += subNew;
          allProcessedDeckIds.push(localSubId);
        }
      }
    }
  }

  // Update synced_at on ALL processed decks so the red dot disappears
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

/** Internal: sync missing cards from sourceDeckId → localDeckId. Returns count of new cards. */
async function _syncCardsBetween(sourceDeckId: string, localDeckId: string): Promise<number> {
  const PAGE = 1000;

  // Get all origin_deck_ids already in the local deck
  const existingOriginIds = new Set<string>();
  let existingOffset = 0;
  while (true) {
    const { data: existingBatch } = await supabase
      .from('cards')
      .select('origin_deck_id')
      .eq('deck_id', localDeckId)
      .not('origin_deck_id', 'is', null)
      .range(existingOffset, existingOffset + PAGE - 1);
    if (!existingBatch || existingBatch.length === 0) break;
    for (const c of existingBatch) existingOriginIds.add((c as any).origin_deck_id);
    if (existingBatch.length < PAGE) break;
    existingOffset += PAGE;
  }

  // Get source cards
  const allSourceCards: any[] = [];
  let sourceOffset = 0;
  while (true) {
    const { data: sourceBatch } = await supabase
      .from('cards')
      .select('id, front_content, back_content, card_type')
      .eq('deck_id', sourceDeckId)
      .range(sourceOffset, sourceOffset + PAGE - 1);
    if (!sourceBatch || sourceBatch.length === 0) break;
    allSourceCards.push(...sourceBatch);
    if (sourceBatch.length < PAGE) break;
    sourceOffset += PAGE;
  }

  const newCards = allSourceCards.filter((c: any) => !existingOriginIds.has(c.id));

  if (newCards.length > 0) {
    const inserts = newCards.map((c: any) => ({
      deck_id: localDeckId,
      front_content: c.front_content,
      back_content: c.back_content,
      card_type: c.card_type ?? 'basic',
      origin_deck_id: c.id,
    }));

    for (let i = 0; i < inserts.length; i += 500) {
      const batch = inserts.slice(i, i + 500);
      await supabase.from('cards').insert(batch as any);
    }
  }

  return newCards.length;
}

/**
 * Cleanup: delete local mirrored decks and their cards when leaving a sala.
 * review_logs are NOT deleted (they stay for 30 days).
 */
export async function cleanupFollowerDecks(userId: string, folderId: string): Promise<void> {
  // Find all decks in this folder belonging to this user
  const { data: localDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('folder_id', folderId);

  if (!localDecks || localDecks.length === 0) return;

  const deckIds = localDecks.map((d: any) => d.id);

  // Also find sub-decks
  const { data: subDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .in('parent_deck_id', deckIds);

  const allDeckIds = [...deckIds, ...(subDecks ?? []).map((d: any) => d.id)];

  // Delete cards first (FK constraint)
  for (let i = 0; i < allDeckIds.length; i += 200) {
    const batch = allDeckIds.slice(i, i + 200);
    await supabase.from('cards').delete().in('deck_id', batch);
  }

  // Delete sub-decks first, then parent decks
  if (subDecks && subDecks.length > 0) {
    await supabase.from('decks').delete().in('id', subDecks.map((d: any) => d.id));
  }
  await supabase.from('decks').delete().in('id', deckIds);
}
