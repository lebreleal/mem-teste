/**
 * Turma member management, ranking, and permissions.
 * Extracted from turmaService.ts for SRP compliance.
 * 
 * KEY OPTIMIZATION: fetchTurmaMembersWithStats and fetchTurmaRanking
 * now use a single RPC instead of N+1 sequential queries.
 */

import { supabase } from '@/integrations/supabase/client';
import { calculateStreak, getMascotState } from '@/lib/streakUtils';
import type { TurmaMember, TurmaMemberWithStats, TurmaRole } from '@/types/turma';

/** Fetch members with stats using optimized RPC (eliminates N+1 loop). */
export async function fetchTurmaMembersWithStats(turmaId: string): Promise<TurmaMemberWithStats[]> {
  // Try optimized RPC first
  try {
    const { data, error } = await supabase.rpc('get_turma_members_ranking' as any, { p_turma_id: turmaId } as any);
    if (!error && data) {
      return (data as any[]).map(row => ({
        user_id: row.user_id,
        user_name: row.user_name || 'Anônimo',
        user_email: '',
        streak: row.streak ?? 0,
        energy: 0,
        mascot_state: getMascotState(row.last_study_at ? new Date(row.last_study_at) : null),
        total_reviews: Number(row.total_reviews) || 0,
      }));
    }
  } catch {
    // Fallback to legacy approach if RPC doesn't exist yet
  }

  // Legacy fallback (N+1)
  const { data: members } = await supabase.from('turma_members').select('user_id, role').eq('turma_id', turmaId);
  if (!members) return [];
  const userIds = members.map(m => (m as any).user_id);
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  if (!profiles) return [];

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const results: TurmaMemberWithStats[] = [];

  for (const profile of profiles) {
    const p = profile as any;
    const { data: logs } = await supabase.from('review_logs').select('reviewed_at').eq('user_id', p.id)
      .gte('reviewed_at', thirtyDaysAgo.toISOString()).order('reviewed_at', { ascending: false });
    const totalReviews = logs?.length ?? 0;
    const lastStudy = logs && logs.length > 0 ? new Date(logs[0].reviewed_at) : null;
    const streak = logs ? calculateStreak(logs.map(l => l.reviewed_at)) : 0;
    const mascotState = getMascotState(lastStudy);

    results.push({ user_id: p.id, user_name: p.name || 'Anônimo', user_email: '', streak, energy: 0, mascot_state: mascotState, total_reviews: totalReviews });
  }
  results.sort((a, b) => b.total_reviews - a.total_reviews);
  return results;
}

/** Fetch turma ranking - uses same optimized RPC. */
export async function fetchTurmaRanking(turmaId: string): Promise<TurmaMemberWithStats[]> {
  return fetchTurmaMembersWithStats(turmaId);
}

export async function fetchTurmaRole(userId: string, turmaId: string): Promise<TurmaRole | null> {
  // Order by role to prioritize admin > moderator > member, use limit(1) to handle duplicate rows
  const { data } = await supabase
    .from('turma_members')
    .select('role')
    .eq('turma_id', turmaId)
    .eq('user_id', userId)
    .order('role', { ascending: true }) // admin < member < moderator alphabetically
    .limit(1)
    .maybeSingle();
  return (data as any)?.role ?? null;
}

export async function fetchTurmaMembers(turmaId: string): Promise<TurmaMember[]> {
  const { data: members } = await supabase.from('turma_members').select('user_id, role, is_subscriber').eq('turma_id', turmaId);
  if (!members) return [];
  const seen = new Set<string>();
  const unique = (members as any[]).filter(m => {
    if (seen.has(m.user_id)) return false;
    seen.add(m.user_id);
    return true;
  });
  const userIds = unique.map(m => m.user_id);
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return unique.map((m: any) => {
    const p = profileMap.get(m.user_id) as any;
    return { user_id: m.user_id, role: m.role, user_name: p?.name || 'Anônimo', user_email: '', is_subscriber: m.is_subscriber ?? false };
  });
}

export async function changeMemberRole(turmaId: string, userId: string, role: TurmaRole) {
  const { error } = await supabase.from('turma_members').update({ role } as any).eq('turma_id', turmaId).eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(turmaId: string, userId: string) {
  const { error } = await supabase.from('turma_members').delete().eq('turma_id', turmaId).eq('user_id', userId);
  if (error) throw error;
}

export async function toggleSubscriber(turmaId: string, userId: string, isSubscriber: boolean) {
  const { error } = await supabase.from('turma_members').update({ is_subscriber: isSubscriber } as any).eq('turma_id', turmaId).eq('user_id', userId);
  if (error) throw error;
}
