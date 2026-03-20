/**
 * Auth service — abstracts supabase.auth operations.
 * Per Lei 2A: components MUST NOT import supabase directly.
 */

import { supabase } from '@/integrations/supabase/client';

/** Get the current session access token. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Restore a session from tokens. */
export async function setSession(accessToken: string, refreshToken: string): Promise<void> {
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

/** Get the current authenticated user ID. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Invoke a Supabase edge function. */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  return { data: data as T | null, error };
}
