/**
 * Deck access codes — single-use codes issued by the platform admins so a
 * deck seller can hand out access to their deck.
 *
 * Components never touch supabase directly: everything goes through here.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DeckAccessCode {
  id: string;
  code: string;
  deck_id: string;
  owner_id: string;
  owner_name: string;
  note: string;
  created_by: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
}

/** Redeem a code: copies the seller's deck into the current user's account. */
export async function redeemDeckAccessCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_deck_access_code', {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Admin: list every issued code, newest first. */
export async function fetchDeckAccessCodes(): Promise<DeckAccessCode[]> {
  const { data, error } = await supabase
    .from('deck_access_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as DeckAccessCode[];
}

/** Admin: generate `count` single-use codes for a deck. */
export async function createDeckAccessCodes(deckId: string, count: number, note: string): Promise<DeckAccessCode[]> {
  const { data, error } = await supabase.rpc('admin_create_deck_access_codes', {
    p_deck_id: deckId,
    p_count: count,
    p_note: note,
  });
  if (error) throw error;
  return (data ?? []) as unknown as DeckAccessCode[];
}

/** Admin: revoke a code that has not been used yet. */
export async function deleteDeckAccessCode(id: string): Promise<void> {
  const { error } = await supabase.from('deck_access_codes').delete().eq('id', id);
  if (error) throw error;
}

/** Friendly message for the Postgres errors raised by the redeem RPC. */
export function redeemErrorMessage(message: string): string {
  if (message.includes('invalid_code')) return 'Código inválido.';
  if (message.includes('code_already_used')) return 'Este código já foi utilizado.';
  if (message.includes('own_deck')) return 'Este código é do seu próprio baralho.';
  if (message.includes('deck_not_found')) return 'O baralho deste código não existe mais.';
  return 'Não foi possível resgatar o código.';
}
