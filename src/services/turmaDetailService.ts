/**
 * Turma detail service — queries/mutations used by TurmaDetailContext and CreatorPanelSheet.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── TurmaDetailContext ───

export async function fetchTurmaPublic(turmaId: string) {
  const { data } = await supabase.from('turmas').select('*').eq('id', turmaId).single();
  if (!data) return null;
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: [(data as any).owner_id] });
  const ownerName = (profiles && profiles.length > 0) ? (profiles[0] as any).name || 'Anônimo' : 'Anônimo';
  return { ...data, owner_name: ownerName };
}

export async function fetchTurmaLessonFiles(turmaId: string): Promise<{ id: string; lesson_id: string }[]> {
  const { data } = await supabase.from('turma_lesson_files' as any).select('id, lesson_id').eq('turma_id', turmaId);
  return (data ?? []) as unknown as { id: string; lesson_id: string }[];
}

export async function fetchActiveSubscription(turmaId: string, userId: string) {
  const { data } = await supabase.from('turma_subscriptions').select('*')
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

export async function importTurmaExam(userId: string, exam: any): Promise<string> {
  // Check if already imported
  const { data: existing } = await supabase.from('exams').select('id').eq('user_id', userId).eq('source_turma_exam_id', exam.id).limit(1);
  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: questions, error } = await supabase.from('turma_exam_questions').select('*').eq('exam_id', exam.id).order('sort_order', { ascending: true });
  if (error) throw error;

  const totalPoints = (questions ?? []).reduce((sum: number, q: any) => sum + (q.points || 1), 0);
  const { data: newExam, error: examError } = await (supabase.from('exams' as any) as any)
    .insert({ user_id: userId, deck_id: null, title: exam.title, status: 'pending', total_points: totalPoints, time_limit_seconds: exam.time_limit_seconds || null, source_turma_exam_id: exam.id })
    .select().single();
  if (examError) throw examError;

  const questionsToInsert = (questions ?? []).map((q: any, idx: number) => ({
    exam_id: newExam.id, question_type: q.question_type, question_text: q.question_text,
    options: q.options ?? null, correct_answer: q.correct_answer, correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
  }));
  const { error: qError } = await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
  if (qError) throw qError;

  return newExam.id;
}

// ─── CreatorPanelSheet ───

export async function fetchCreatorCommunityStats(turmaId: string) {
  const { data: members } = await supabase.from('turma_members').select('is_subscriber').eq('turma_id', turmaId);
  const { data: tDecks } = await supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId);
  const deckIds = (tDecks ?? []).map((d: any) => d.deck_id);
  let totalCards = 0;
  let pendingSuggestions = 0;
  if (deckIds.length > 0) {
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', deckIds);
    totalCards = count ?? 0;
    const { count: sugCount } = await supabase.from('deck_suggestions').select('id', { count: 'exact', head: true }).in('deck_id', deckIds).eq('status', 'pending');
    pendingSuggestions = sugCount ?? 0;
  }
  const totalMembers = (members ?? []).length;
  const subscribers = (members ?? []).filter((m: any) => m.is_subscriber).length;
  return { totalMembers, subscribers, totalCards, pendingSuggestions };
}

export interface PendingSuggestion {
  id: string;
  suggestion_type: string;
  suggested_content: any;
  suggested_tags: any;
  rationale: string;
  created_at: string;
  suggester_name: string;
  deck_name: string;
  card_id: string | null;
  original_card: { front_content: string; back_content: string } | null;
  content_status: string;
  tags_status: string;
}

export async function fetchPendingSuggestions(turmaId: string, userId: string): Promise<PendingSuggestion[]> {
  if (!userId) return [];
  const { data: tDecks } = await supabase.from('turma_decks').select('deck_id').eq('turma_id', turmaId);
  const deckIds = (tDecks ?? []).map((d: any) => d.deck_id);
  if (deckIds.length === 0) return [];

  const { data: suggestions } = await supabase.from('deck_suggestions').select('*').in('deck_id', deckIds).eq('status', 'pending').order('created_at', { ascending: false });
  if (!suggestions || suggestions.length === 0) return [];

  const suggesterIds = [...new Set(suggestions.map((s: any) => s.suggester_user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: suggesterIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  const cardIds = suggestions.map((s: any) => s.card_id).filter(Boolean);
  let cardMap = new Map<string, { front_content: string; back_content: string }>();
  if (cardIds.length > 0) {
    const { data: cards } = await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds);
    (cards ?? []).forEach((c: any) => cardMap.set(c.id, { front_content: c.front_content, back_content: c.back_content }));
  }

  const { data: decks } = await supabase.from('decks').select('id, name').in('id', deckIds);
  const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));

  return suggestions.map((s: any) => ({
    id: s.id,
    suggestion_type: s.suggestion_type,
    suggested_content: s.suggested_content,
    suggested_tags: s.suggested_tags,
    rationale: s.rationale,
    created_at: s.created_at,
    suggester_name: profileMap.get(s.suggester_user_id) || 'Anônimo',
    deck_name: deckMap.get(s.deck_id) || '—',
    card_id: s.card_id,
    original_card: s.card_id ? (cardMap.get(s.card_id) ?? null) : null,
    content_status: s.content_status,
    tags_status: s.tags_status,
  }));
}

export async function updateSuggestionStatus(id: string, status: string, moderatorId: string, content?: any) {
  const updateData: any = { status, moderator_user_id: moderatorId };
  if (content) updateData.suggested_content = content;
  const { error } = await supabase.from('deck_suggestions').update(updateData).eq('id', id);
  if (error) throw error;
}
