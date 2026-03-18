/**
 * Card Mutation operations — Write/modify data (CQRS: Command side).
 * Single Responsibility: Only handles creating, updating, deleting cards.
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUtils';

/** Create a single card. Accepts optional created_at for positional insertion. */
export async function createCard(deckId: string, input: { frontContent: string; backContent: string; cardType?: string; createdAt?: string }) {
  const insertData: { deck_id: string; front_content: string; back_content: string; card_type: string; created_at?: string } = {
    deck_id: deckId,
    front_content: input.frontContent,
    back_content: input.backContent,
    card_type: input.cardType ?? 'basic',
  };
  if (input.createdAt) insertData.created_at = input.createdAt;
  const { data, error } = await supabase
    .from('cards')
    .insert(insertData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Create multiple cards at once (batch insert). Uses parallel batches for speed. */
export async function createCards(deckId: string, cards: { frontContent: string; backContent: string; cardType: string }[]) {
  const baseTime = Date.now();
  const rows = cards.map((c, idx) => ({
    deck_id: deckId,
    front_content: c.frontContent,
    back_content: c.backContent,
    card_type: c.cardType,
    state: 0,
    stability: 0,
    difficulty: 0,
    created_at: new Date(baseTime + idx).toISOString(),
  }));
  const BATCH_SIZE = 500;
  const CONCURRENT = 5;
  const allData: any[] = [];
  const batches: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }
  for (let i = 0; i < batches.length; i += CONCURRENT) {
    const group = batches.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      group.map(batch => supabase.from('cards').insert(batch).select())
    );
    for (const { data, error } of results) {
      if (error) throw error;
      if (data) allData.push(...data);
    }
  }
  return allData;
}

/** Update a card's content. */
export async function updateCard(id: string, frontContent: string, backContent: string) {
  const { data, error } = await supabase
    .from('cards')
    .update({ front_content: frontContent, back_content: backContent })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a card. */
export async function deleteCard(id: string) {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}

/** Move a card to a different deck. */
export async function moveCard(id: string, targetDeckId: string) {
  const { error } = await supabase.from('cards').update({ deck_id: targetDeckId } as any).eq('id', id);
  if (error) throw error;
}

/** Bulk move cards to a different deck. */
export async function bulkMoveCards(ids: string[], targetDeckId: string) {
  const { error } = await supabase.from('cards').update({ deck_id: targetDeckId } as any).in('id', ids);
  if (error) throw error;
}

/** Bulk delete cards. */
export async function bulkDeleteCards(ids: string[]) {
  const { error } = await supabase.from('cards').delete().in('id', ids);
  if (error) throw error;
}

/** Bury cards by pushing their scheduled_date to a given ISO date. */
export async function buryCards(cardIds: string[], scheduledDate: string) {
  if (cardIds.length === 0) return;
  const { error } = await supabase
    .from('cards')
    .update({ scheduled_date: scheduledDate })
    .in('id', cardIds);
  if (error) throw error;
}

/** Freeze a card (push scheduled_date 100 years ahead and set state to review). */
export async function freezeCard(cardId: string) {
  const farFuture = new Date();
  farFuture.setFullYear(farFuture.getFullYear() + 100);
  const { error } = await supabase
    .from('cards')
    .update({ scheduled_date: farFuture.toISOString(), state: 2 })
    .eq('id', cardId);
  if (error) throw error;
}

/** Unfreeze a card (reset to new state). */
export async function unfreezeCard(cardId: string) {
  const { error } = await supabase
    .from('cards')
    .update({ scheduled_date: new Date().toISOString(), state: 0, stability: 0, difficulty: 0 })
    .eq('id', cardId);
  if (error) throw error;
}

/** Bury a single card until tomorrow. */
export async function burySingleCard(cardId: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const { error } = await supabase
    .from('cards')
    .update({ scheduled_date: tomorrow.toISOString() })
    .eq('id', cardId);
  if (error) throw error;
}

/** Patch specific fields on a card row. */
export async function patchCard(cardId: string, fields: { front_content?: string; back_content?: string }) {
  const { error } = await supabase
    .from('cards')
    .update(fields)
    .eq('id', cardId);
  if (error) throw error;
}

/** Count review-state cards due now across multiple deck IDs. */
export async function countReviewDueCards(deckIds: string[], nowISO: string): Promise<number> {
  const { count, error } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .in('deck_id', deckIds)
    .eq('state', 2)
    .lte('scheduled_date', nowISO);
  if (error) throw error;
  return count ?? 0;
}

/** Fetch study plan deck_ids for a user. */
export async function fetchStudyPlanDeckIds(userId: string): Promise<Array<{ deck_ids: string[] | null }>> {
  const { data, error } = await supabase
    .from('study_plans')
    .select('deck_ids')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as Array<{ deck_ids: string[] | null }>;
}

/** Upload a card image to storage. Returns the public URL. */
export async function uploadCardImage(userId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Máximo 5MB');
  const compressed = await compressImage(file);
  const ext = compressed.name.split('.').pop() || 'webp';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(path, compressed);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
  return urlData.publicUrl;
}
