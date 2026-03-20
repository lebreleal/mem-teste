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
