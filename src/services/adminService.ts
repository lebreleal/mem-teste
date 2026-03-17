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

// ── AI Chat Conversations ──

export async function createAIConversation(userId: string, title: string) {
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error || !data) throw new Error('Failed to create conversation');
  return data;
}

export async function saveAIChatMessage(convId: string, userId: string, role: string, content: string) {
  await supabase.from('ai_chat_messages').insert({
    conversation_id: convId,
    user_id: userId,
    role,
    content,
  });
  await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
}

export async function deleteAIConversation(convId: string) {
  await supabase.from('ai_chat_messages').delete().eq('conversation_id', convId);
  await supabase.from('ai_conversations').delete().eq('id', convId);
}

export async function fetchAIConversations(userId: string) {
  const { data } = await supabase
    .from('ai_conversations')
    .select('id, title, updated_at, created_at, user_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  return data ?? [];
}

export async function fetchAIChatMessages(convId: string) {
  const { data } = await supabase
    .from('ai_chat_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

// ── Impersonation ──

export async function invokeImpersonate(targetUserId: string) {
  const { data, error } = await supabase.functions.invoke('admin-impersonate', {
    body: { target_user_id: targetUserId },
  });
  if (error || !data?.token) throw new Error('Failed to impersonate');
  return data;
}

export async function verifyOtp(tokenHash: string) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) throw error;
}

export async function fetchProfilePremiumExpiry(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('premium_expires_at').eq('id', userId).single();
  return (data as any)?.premium_expires_at ?? null;
}

// ── Deck Suggestions (Creator Panel) ──

export async function reviewSuggestion(id: string, status: 'accepted' | 'rejected', moderatorId: string, content?: { front_content: string; back_content: string }) {
  const updateData: any = { status, moderator_user_id: moderatorId };
  if (content) updateData.suggested_content = content;
  const { error } = await supabase.from('deck_suggestions').update(updateData).eq('id', id);
  if (error) throw error;
}

// ── Turma Exam queries (for TurmaExamResults/TurmaExamTake) ──

export async function fetchTurmaExamDetail(examId: string) {
  const { data, error } = await supabase.from('turma_exams').select('id, turma_id, title, description, time_limit_seconds, is_published, total_questions, created_at, created_by, subject_id, lesson_id, subscribers_only').eq('id', examId).single();
  if (error) throw error;
  return data;
}

export async function fetchTurmaExamAttemptForResults(examId: string, userId: string, attemptId: string | null) {
  if (!attemptId) {
    const { data } = await supabase.from('turma_exam_attempts')
      .select('id, exam_id, user_id, status, scored_points, total_points, started_at, completed_at')
      .eq('exam_id', examId).eq('user_id', userId)
      .eq('status', 'completed').order('completed_at', { ascending: false }).limit(1);
    return data?.[0] || null;
  }
  const { data, error } = await supabase.from('turma_exam_attempts')
    .select('id, exam_id, user_id, status, scored_points, total_points, started_at, completed_at')
    .eq('id', attemptId).single();
  if (error) throw error;
  return data;
}

export async function fetchTurmaExamAnswers(attemptId: string) {
  const { data, error } = await supabase.from('turma_exam_answers')
    .select('id, attempt_id, question_id, user_answer, selected_indices, scored_points, is_graded, ai_feedback')
    .eq('attempt_id', attemptId);
  if (error) throw error;
  return data ?? [];
}

export async function gradeExamQuestion(questionId: string, userAnswer: string, correctAnswer: string, questionText: string) {
  const { data, error } = await supabase.functions.invoke('grade-exam', {
    body: { questionId, userAnswer, correctAnswer, questionText, aiModel: 'flash' },
  });
  if (error) throw error;
  if (data.error) throw new Error(data.error);
  return data as { score: number; feedback: string; freeGradingsRemaining?: number };
}

export async function updateTurmaExamAnswer(answerId: string, scoredPoints: number, feedback: string) {
  await supabase.from('turma_exam_answers')
    .update({ scored_points: scoredPoints, is_graded: true, ai_feedback: feedback } as any)
    .eq('id', answerId);
}

export async function updateTurmaExamAttemptScore(attemptId: string, scoredPoints: number) {
  await supabase.from('turma_exam_attempts')
    .update({ scored_points: scoredPoints } as any)
    .eq('id', attemptId);
}

export async function fetchActiveSubscription(turmaId: string, userId: string) {
  const { data } = await supabase.from('turma_subscriptions').select('id, turma_id, user_id, expires_at')
    .eq('turma_id', turmaId).eq('user_id', userId).gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1);
  return data && data.length > 0 ? data[0] : null;
}

// ── PublicCommunity queries ──

export async function fetchTurmaBySlugOrId(slugOrId: string) {
  const { data: bySlug } = await supabase.from('turmas').select('id, name, description, owner_id, invite_code, created_at, is_private, avg_rating, rating_count, member_count, cover_image_url, subscription_price, share_slug').eq('share_slug', slugOrId).maybeSingle();
  if (bySlug) return bySlug;
  const { data: byId } = await supabase.from('turmas').select('id, name, description, owner_id, invite_code, created_at, is_private, avg_rating, rating_count, member_count, cover_image_url, subscription_price, share_slug').eq('id', slugOrId).maybeSingle();
  return byId;
}

export async function fetchOwnerName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single();
  return data?.name ?? '';
}

export async function fetchTurmaMemberCount(turmaId: string): Promise<number> {
  const { count } = await supabase.from('turma_members').select('id', { count: 'exact', head: true }).eq('turma_id', turmaId);
  return count ?? 0;
}

export async function fetchPublicCommunityDecks(turmaId: string) {
  const { data: tDecks } = await supabase
    .from('turma_decks')
    .select('id, deck_id, is_published')
    .eq('turma_id', turmaId)
    .eq('is_published', true);
  if (!tDecks || tDecks.length === 0) return [];

  const deckIds = tDecks.map((d: any) => d.deck_id);
  const { data: deckInfo } = await supabase.from('decks').select('id, name').in('id', deckIds);
  const nameMap = new Map((deckInfo ?? []).map((d: any) => [d.id, d.name]));

  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
  const countMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));

  return tDecks
    .map((td: any) => ({
      turmaDeckId: td.id,
      deckId: td.deck_id,
      name: nameMap.get(td.deck_id) ?? 'Sem nome',
      cardCount: countMap.get(td.deck_id) ?? 0,
    }))
    .filter((d: any) => !d.name.includes('Caderno de Erros'));
}

// ── TurmaDetail helpers ──

export async function fetchDeckQuestionCounts(deckIds: string[]): Promise<Map<string, number>> {
  const { data } = await supabase.from('deck_questions').select('deck_id').in('deck_id', deckIds);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + 1);
  }
  return counts;
}

export async function joinTurmaAndCreateFolder(userId: string, turmaId: string, turmaName: string): Promise<string | undefined> {
  await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: userId } as any);
  const { data: existingFolders } = await supabase.from('folders')
    .select('id').eq('user_id', userId).eq('source_turma_id', turmaId);
  let folderId: string | undefined;
  if (!existingFolders || existingFolders.length === 0) {
    const { data: newFolder } = await supabase.from('folders')
      .insert({ user_id: userId, name: turmaName, section: 'community', source_turma_id: turmaId } as any)
      .select('id').single();
    folderId = (newFolder as any)?.id;
  } else {
    folderId = existingFolders[0].id;
  }
  return folderId;
}

export async function fetchTurmaFolderId(userId: string, turmaId: string): Promise<string | undefined> {
  const { data } = await supabase.from('folders')
    .select('id').eq('user_id', userId).eq('source_turma_id', turmaId).limit(1);
  return data?.[0]?.id;
}

// ── Admin Impersonation ──

export async function adminImpersonate(targetUserId: string): Promise<{ token: string } | null> {
  const { data, error } = await supabase.functions.invoke('admin-impersonate', {
    body: { target_user_id: targetUserId },
  });
  if (error || !data?.token) return null;
  return { token: data.token };
}

export async function verifyImpersonationToken(tokenHash: string): Promise<boolean> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  return !error;
}

export async function fetchProfilePremiumExpiry(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('premium_expires_at').eq('id', userId).single();
  return (data as any)?.premium_expires_at ?? null;
}

// ── Public Community Service ──

export async function fetchTurmaBySlugOrId(slugOrId: string) {
  const { data: bySlug } = await supabase.from('turmas').select('*').eq('share_slug', slugOrId).maybeSingle();
  if (bySlug) return bySlug;
  const { data: byId } = await supabase.from('turmas').select('*').eq('id', slugOrId).maybeSingle();
  return byId;
}

export async function fetchProfileNameById(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single();
  return data?.name ?? 'Criador';
}

export async function fetchTurmaMemberCount(turmaId: string): Promise<number> {
  const { count } = await supabase.from('turma_members').select('id', { count: 'exact', head: true }).eq('turma_id', turmaId);
  return count ?? 0;
}

export async function fetchPublishedTurmaDecks(turmaId: string) {
  const { data: tDecks } = await supabase
    .from('turma_decks')
    .select('id, deck_id, is_published')
    .eq('turma_id', turmaId)
    .eq('is_published', true);
  if (!tDecks || tDecks.length === 0) return [];

  const deckIds = tDecks.map((d: any) => d.deck_id);
  const { data: deckInfo } = await supabase.from('decks').select('id, name').in('id', deckIds);
  const nameMap = new Map((deckInfo ?? []).map((d: any) => [d.id, d.name]));

  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
  const countMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));

  return tDecks
    .map((td: any) => ({
      turmaDeckId: td.id,
      deckId: td.deck_id,
      name: nameMap.get(td.deck_id) ?? 'Sem nome',
      cardCount: countMap.get(td.deck_id) ?? 0,
    }))
    .filter((d: any) => !d.name.includes('Caderno de Erros'));
}

// ── Sala Decks (TurmaDetail) ──

export async function fetchSalaDecksData(turmaId: string) {
  const { data: turmaDecks } = await supabase
    .from('turma_decks')
    .select('id, deck_id, is_published')
    .eq('turma_id', turmaId)
    .eq('is_published', true);

  if (!turmaDecks || turmaDecks.length === 0) return { turmaDecks: [], decks: [], cardCountMap: new Map() };

  const rootDeckIds = turmaDecks.map((td: any) => td.deck_id);

  const { data: childDecks } = await supabase
    .from('decks')
    .select('id')
    .in('parent_deck_id', rootDeckIds)
    .eq('is_archived', false);

  const allDeckIds = [...rootDeckIds, ...(childDecks ?? []).map((d: any) => d.id)];

  const { data: decks } = await supabase
    .from('decks')
    .select('*')
    .in('id', allDeckIds);

  // Fetch card stats
  const cardCountMap = new Map<string, { total: number; mastered: number; novo: number; facil: number; bom: number; dificil: number; errei: number }>();
  const PAGE = 1000;

  for (let i = 0; i < allDeckIds.length; i += 200) {
    const batch = allDeckIds.slice(i, i + 200);
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: cards } = await supabase
        .from('cards')
        .select('id, deck_id, state, difficulty')
        .in('deck_id', batch)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (cards) {
        for (const c of cards as any[]) {
          const entry = cardCountMap.get(c.deck_id) ?? { total: 0, mastered: 0, novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
          entry.total++;
          entry.novo++;
          cardCountMap.set(c.deck_id, entry);
        }
      }
      hasMore = (cards?.length ?? 0) === PAGE;
      offset += PAGE;
    }
  }

  return { turmaDecks, decks: decks ?? [], rootDeckIds, allDeckIds, cardCountMap };
}

export async function fetchSalaQuestionCounts(deckIds: string[]): Promise<Map<string, number>> {
  if (deckIds.length === 0) return new Map();
  const { data } = await supabase.from('deck_questions').select('deck_id').in('deck_id', deckIds);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + 1);
  }
  return counts;
}

export async function insertTurmaMember(turmaId: string, userId: string) {
  const { error } = await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: userId } as any);
  if (error) throw error;
}

export async function getOrCreateTurmaFolder(userId: string, turmaId: string, turmaName: string): Promise<string | undefined> {
  const { data: existingFolders } = await supabase.from('folders')
    .select('id').eq('user_id', userId).eq('source_turma_id', turmaId);
  if (existingFolders && existingFolders.length > 0) return existingFolders[0].id;
  const { data: newFolder } = await supabase.from('folders')
    .insert({ user_id: userId, name: turmaName, section: 'community', source_turma_id: turmaId } as any)
    .select('id').single();
  return (newFolder as any)?.id;
}
