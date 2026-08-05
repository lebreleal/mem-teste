/**
 * Profile service — abstracts profile-related Supabase operations.
 */

import { supabase } from '@/integrations/supabase/client';

/** Fetch a user's profile name. */
export async function fetchProfileName(userId: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('name').eq('id', userId).single();
  if (error) throw error;
  return data?.name ?? '';
}

/** Update a user's profile name. */
export async function updateProfileName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ name }).eq('id', userId);
  if (error) throw error;
}

/** Verify current password by attempting sign-in. */
export async function verifyPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Update user password. */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Upload avatar and update user metadata. Returns the new public URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();

  const { error: updateErr } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
  if (updateErr) throw updateErr;

  return publicUrl;
}

// ─── Core profile row (used by useProfile / dashboard bootstrap) ───

export interface ProfileData {
  id: string;
  energy: number;
  ai_credits: number;
  ai_credits_purchased: number;
  successful_cards_counter: number;
  daily_cards_studied: number;
  daily_energy_earned: number;
  daily_new_cards_limit: number;
  daily_study_minutes: number;
  last_energy_recharge: string | null;
  last_study_reset_date: string | null;
  created_at: string;
  weekly_new_cards: Record<string, number> | null;
  weekly_study_minutes: Record<string, number> | null;
  is_profile_public: boolean;
  current_streak: number;
}

const PROFILE_COLUMNS =
  'id, energy, ai_credits, ai_credits_purchased, successful_cards_counter, daily_cards_studied, daily_energy_earned, daily_new_cards_limit, daily_study_minutes, last_energy_recharge, last_study_reset_date, created_at, weekly_new_cards, weekly_study_minutes, is_profile_public, current_streak';

export async function fetchProfile(userId: string): Promise<ProfileData> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data as unknown as ProfileData;
}

/**
 * Postgres `numeric` columns chegam pelo Realtime como STRING (ex.: "1817"),
 * diferente do REST (que devolve number). Sem normalizar, o cache do perfil
 * fica com strings e qualquer soma vira concatenação — foi o que zerava a
 * exibição dos créditos após qualquer UPDATE no perfil.
 */
const NUMERIC_PROFILE_FIELDS = [
  'energy', 'ai_credits', 'ai_credits_purchased', 'successful_cards_counter',
  'daily_cards_studied', 'daily_energy_earned', 'daily_new_cards_limit',
  'daily_study_minutes', 'current_streak',
] as const;

function normalizeProfileRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const key of NUMERIC_PROFILE_FIELDS) {
    const v = out[key];
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      out[key] = Number(v);
    }
  }
  return out;
}

/** Realtime UPDATE stream for a single profile row. Callers own the unsubscribe. */
export function subscribeToProfileRow(
  userId: string,
  onUpdate: (row: Record<string, unknown>) => void
) {
  const channel = supabase
    .channel(`profile-${userId}-${Date.now()}`)
    .on(
      'postgres_changes' as 'system',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      (payload: { new?: Record<string, unknown> }) => {
        if (payload?.new) onUpdate(normalizeProfileRow(payload.new));
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
