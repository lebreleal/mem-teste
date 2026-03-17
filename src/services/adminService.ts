/**
 * Admin service — abstracts admin-only Supabase operations.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Error Logs ──

export interface ErrorLog {
  id: string;
  user_id: string | null;
  error_message: string;
  error_stack: string;
  component_name: string;
  route: string;
  metadata: Record<string, unknown>;
  severity: string;
  created_at: string;
}

export async function fetchErrorLogs(params: { severity?: string; search?: string; limit?: number }): Promise<ErrorLog[]> {
  let query = (supabase as any)
    .from('app_error_logs')
    .select('id, user_id, error_message, error_stack, component_name, route, metadata, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 200);

  if (params.severity && params.severity !== 'all') {
    query = query.eq('severity', params.severity);
  }
  if (params.search?.trim()) {
    query = query.ilike('error_message', `%${params.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ErrorLog[];
}

export async function deleteOldErrorLogs(olderThanDays = 30): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const { error } = await (supabase as any)
    .from('app_error_logs')
    .delete()
    .lt('created_at', cutoff.toISOString());
  if (error) throw error;
}

// ── AI Usage Report ──

export interface UsageEntry {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  feature_key: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  energy_cost: number;
}

export async function fetchGlobalTokenUsage(params: {
  dateFrom: string | null;
  dateTo: string | null;
  limit?: number;
}): Promise<UsageEntry[]> {
  const { data, error } = await supabase.rpc('admin_get_global_token_usage' as any, {
    p_user_id: null,
    p_date_from: params.dateFrom,
    p_date_to: params.dateTo,
    p_limit: params.limit ?? 500,
  });
  if (error) throw error;
  return (data as UsageEntry[]) || [];
}

export async function deleteTokenUsageEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('ai_token_usage').delete().eq('id', entryId);
  if (error) throw error;
}

// ── Turma Exam lookup ──

export async function fetchTurmaExamTurmaId(turmaExamId: string): Promise<string | null> {
  const { data } = await (supabase.from('turma_exams' as any) as any)
    .select('turma_id')
    .eq('id', turmaExamId)
    .single();
  return data?.turma_id ?? null;
}
