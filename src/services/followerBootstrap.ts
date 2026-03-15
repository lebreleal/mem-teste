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
  // Get all local mirror decks in this folder
  const { data: localDecks } = await supabase
    .from('decks')
    .select('id, source_turma_deck_id, parent_deck_id')
    .eq('user_id', userId)
    .eq('folder_id', folderId)
    .eq('is_archived', false);

  if (!localDecks || localDecks.length === 0) return 0;

  let totalNewCards = 0;

  for (const localDeck of localDecks) {
    const sourceTurmaDeckId = (localDeck as any).source_turma_deck_id;
    if (!sourceTurmaDeckId) continue; // sub-deck, handled via parent

    // Find the original deck_id from turma_decks
    const { data: td } = await supabase
      .from('turma_decks')
      .select('deck_id')
      .eq('id', sourceTurmaDeckId)
      .single();
    if (!td) continue;

    const sourceDeckId = (td as any).deck_id;

    // Get all origin_deck_ids already in the local deck
    const { data: existingCards } = await supabase
      .from('cards')
      .select('origin_deck_id')
      .eq('deck_id', localDeck.id)
      .not('origin_deck_id', 'is', null);

    const existingOriginIds = new Set((existingCards ?? []).map((c: any) => c.origin_deck_id));

    // Get source cards not yet copied
    const { data: sourceCards } = await supabase
      .from('cards')
      .select('id, front_content, back_content, card_type')
      .eq('deck_id', sourceDeckId);

    const newCards = (sourceCards ?? []).filter((c: any) => !existingOriginIds.has(c.id));
    
    if (newCards.length > 0) {
      const inserts = newCards.map((c: any) => ({
        deck_id: localDeck.id,
        front_content: c.front_content,
        back_content: c.back_content,
        card_type: c.card_type ?? 'basic',
        origin_deck_id: c.id,
      }));
      
      // Insert in batches of 500
      for (let i = 0; i < inserts.length; i += 500) {
        const batch = inserts.slice(i, i + 500);
        await supabase.from('cards').insert(batch as any);
      }
      totalNewCards += newCards.length;
    }
  }

  return totalNewCards;
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
