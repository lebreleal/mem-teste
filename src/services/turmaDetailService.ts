/**
 * Turma detail service — queries/mutations used by TurmaDetailContext.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── TurmaDetailContext ───

export async function fetchTurmaPublic(turmaId: string) {
  const { data } = await supabase.from('turmas').select('id, name, description, cover_image_url, subscription_price, owner_id, is_private, invite_code, category, share_slug, subscription_price_yearly, avg_rating, rating_count, created_at, updated_at').eq('id', turmaId).single();
  if (!data) return null;
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: [data.owner_id] });
  const ownerName = (profiles && profiles.length > 0) ? ((profiles[0] as Record<string, unknown>).name as string) || 'Anônimo' : 'Anônimo';
  return { ...data, owner_name: ownerName };
}

export async function fetchTurmaLessonFiles(turmaId: string): Promise<{ id: string; lesson_id: string }[]> {
  const { data } = await supabase.from('turma_lesson_files' as 'turma_members').select('id, lesson_id').eq('turma_id', turmaId);
  return (data ?? []) as unknown as { id: string; lesson_id: string }[];
}

export async function fetchActiveSubscription(turmaId: string, userId: string) {
  const { data } = await supabase.from('turma_subscriptions').select('id, turma_id, user_id, plan_type, status, amount, started_at, expires_at, created_at')
    .eq('turma_id', turmaId).eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1);
  return (data && data.length > 0) ? data[0] : null;
}

export async function restoreSubscriptionStatus(turmaId: string): Promise<boolean> {
  const { data } = await supabase.rpc('restore_subscription_status', { p_turma_id: turmaId });
  return !!data;
}

export async function processSubscription(turmaId: string) {
  const { error } = await supabase.rpc('process_turma_subscription', { p_turma_id: turmaId });
  if (error) throw error;
}
