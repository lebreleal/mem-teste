/**
 * Study plan service — card operations for the study plan dialogs.
 * Covers CatchUpDialog (dilute overdue, reset overdue).
 */

import { supabase } from '@/integrations/supabase/client';

/** Count overdue cards older than a cutoff date. */
export async function countOverdueCards(deckIds: string[], cutoffISO: string): Promise<number> {
  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .in('deck_id', deckIds)
    .eq('state', 2)
    .lt('scheduled_date', cutoffISO);
  return count ?? 0;
}

/** Fetch IDs of overdue review cards, ordered oldest first. */
export async function fetchOverdueCardIds(deckIds: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id')
    .in('deck_id', deckIds)
    .eq('state', 2)
    .lte('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(c => c.id);
}

/** Reschedule a batch of cards to a target date. */
export async function rescheduleCards(cardIds: string[], targetDateISO: string): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .update({ scheduled_date: targetDateISO } as any)
    .in('id', cardIds);
  if (error) throw error;
}

/** Reset old overdue cards to new state. */
export async function resetOverdueCards(deckIds: string[], cutoffISO: string): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .update({ state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() } as any)
    .in('deck_id', deckIds)
    .eq('state', 2)
    .lt('scheduled_date', cutoffISO);
  if (error) throw error;
}
