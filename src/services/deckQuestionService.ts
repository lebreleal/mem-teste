/**
 * deckQuestionService — All Supabase access for DeckQuestionsTab.
 * Extracted per Lei 2A: components MUST NOT import supabase directly.
 */
import { supabase } from '@/integrations/supabase/client';

// ─── Column constants (Lei 1A) ───
const QUESTION_COLS = 'id, deck_id, created_by, question_text, question_type, options, correct_answer, correct_indices, explanation, concepts, sort_order, created_at';
const ATTEMPT_COLS = 'id, question_id, user_id, selected_indices, is_correct, answered_at';

// ─── Auth ───
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── Queries ───

export async function fetchDeckQuestions(deckIds: string[]) {
  const { data, error } = await supabase
    .from('deck_questions' as any)
    .select(QUESTION_COLS)
    .in('deck_id', deckIds)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function fetchQuestionAttempts(userId: string, questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const { data } = await supabase
    .from('deck_question_attempts' as any)
    .select(ATTEMPT_COLS)
    .eq('user_id', userId)
    .in('question_id', questionIds);
  return (data ?? []) as any[];
}

export async function countDescendantCards(deckId: string): Promise<number> {
  const { data } = await supabase.rpc('count_descendant_cards_by_state', { p_deck_id: deckId });
  return (data as any)?.total ?? 0;
}

export async function fetchQuestionConceptDescriptions(questionId: string) {
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('concept_id, context_description')
    .eq('question_id', questionId);
  if (!links || (links as any[]).length === 0) return {};

  const conceptIds = (links as any[]).filter(l => l.context_description).map(l => l.concept_id);
  if (conceptIds.length === 0) return {};

  const { data: gcData } = await supabase
    .from('global_concepts' as any)
    .select('id, name, slug')
    .in('id', conceptIds);

  const descMap: Record<string, string> = {};
  for (const link of links as any[]) {
    if (!link.context_description) continue;
    const gc = (gcData as any[] ?? []).find(g => g.id === link.concept_id);
    if (gc) {
      descMap[gc.name] = link.context_description;
    }
  }
  return { descMap, gcData: gcData as any[] ?? [] };
}

export async function searchCardsForConcept(deckScopeIds: string[], concept: string) {
  const keywords = concept
    .replace(/^(Você conseguiu|Você entendeu|Você sabe).*?\??\s*/i, '')
    .split(/\s+/)
    .map(k => k.replace(/[%,_]/g, ''))
    .filter(w => w.length > 3)
    .slice(0, 4);

  if (keywords.length === 0) return [];

  const { data } = await supabase
    .from('cards')
    .select('id, front_content, back_content, card_type')
    .in('deck_id', deckScopeIds)
    .or(keywords.map(k => `front_content.ilike.%${k}%,back_content.ilike.%${k}%`).join(','))
    .limit(5);

  return data || [];
}

export async function resolveConceptNamesFromLinks(questionId: string): Promise<string[]> {
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('concept_id')
    .eq('question_id', questionId)
    .limit(8);

  const conceptIds = (links ?? []).map((l: any) => l.concept_id).filter(Boolean);
  if (conceptIds.length === 0) return [];

  const { data: gc } = await supabase
    .from('global_concepts' as any)
    .select('name')
    .in('id', conceptIds);

  return (gc ?? []).map((c: any) => c.name).filter(Boolean);
}

export async function fetchUserGlobalConceptNames(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('global_concepts' as any)
    .select('name')
    .eq('user_id', userId)
    .limit(200);
  return (data ?? []).map((c: any) => c.name);
}

export async function searchGlobalConcepts(userId: string, search: string) {
  const { data } = await supabase
    .from('global_concepts' as any)
    .select('id, name, description')
    .eq('user_id', userId)
    .ilike('name', `%${search.trim()}%`)
    .limit(20);
  return (data ?? []) as unknown as { id: string; name: string; description: string | null }[];
}

export async function getGlobalConceptBySlug(userId: string, slug: string) {
  const { data } = await supabase
    .from('global_concepts' as any)
    .select('id, name, description')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();
  return data as unknown as { id: string; name: string; description: string | null } | null;
}

// ─── Mutations ───

export async function saveQuestionAttempt(
  questionId: string, userId: string, selectedIndices: number[], isCorrect: boolean,
) {
  await supabase.from('deck_question_attempts' as any).insert({
    question_id: questionId, user_id: userId, selected_indices: selectedIndices, is_correct: isCorrect,
  });
}

export async function insertConceptCards(deckId: string, cards: { front: string; back: string; card_type?: string }[]) {
  for (const card of cards) {
    await supabase.from('cards').insert({
      deck_id: deckId,
      front_content: card.front,
      back_content: card.back,
      card_type: card.card_type || 'basic',
    });
  }
}

export async function createQuestion(deckId: string, userId: string, data: {
  question_text: string;
  question_type: string;
  options: string[];
  correct_indices: number[];
  explanation: string;
  concepts?: string[];
}) {
  const { error } = await supabase.from('deck_questions' as any).insert({
    deck_id: deckId,
    created_by: userId,
    question_text: data.question_text,
    question_type: data.question_type,
    options: data.options,
    correct_indices: data.correct_indices,
    explanation: data.explanation,
    concepts: data.concepts ?? [],
  });
  if (error) throw error;
}

export async function fetchLatestQuestionId(deckId: string, userId: string): Promise<string | null> {
  const { data } = await supabase.from('deck_questions' as any)
    .select('id')
    .eq('deck_id', deckId)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as any)?.id ?? null;
}

export async function updateQuestionConcepts(questionId: string, concepts: string[]) {
  await supabase.from('deck_questions' as any).update({ concepts }).eq('id', questionId);
}

export async function insertQuestionReturningId(deckId: string, userId: string, data: {
  question_text: string;
  question_type: string;
  options: string[];
  correct_indices: number[];
  explanation: string;
  concepts?: string[];
}): Promise<string | null> {
  const { data: inserted } = await supabase.from('deck_questions' as any).insert({
    deck_id: deckId,
    created_by: userId,
    question_text: data.question_text,
    question_type: data.question_type,
    options: data.options,
    correct_indices: data.correct_indices,
    explanation: data.explanation,
    concepts: data.concepts ?? [],
  }).select('id').single();
  return (inserted as any)?.id ?? null;
}

export async function deleteQuestion(questionId: string) {
  const { error } = await supabase.from('deck_questions' as any).delete().eq('id', questionId);
  if (error) throw error;
}

export async function bulkDeleteQuestions(ids: string[]) {
  for (const id of ids) {
    const { error } = await supabase.from('deck_questions' as any).delete().eq('id', id);
    if (error) throw error;
  }
}

export async function updateDeckQuestion(questionId: string, data: {
  question_text: string;
  options: string[];
  correct_indices: number[];
  explanation: string;
  concepts: string[];
}) {
  const { error } = await supabase.from('deck_questions' as any).update({
    question_text: data.question_text,
    options: data.options,
    correct_indices: data.correct_indices,
    explanation: data.explanation,
    concepts: data.concepts,
  }).eq('id', questionId);
  if (error) throw error;
}

export async function updateGlobalConceptDescription(conceptId: string, description: string | null) {
  await supabase
    .from('global_concepts' as any)
    .update({ description } as any)
    .eq('id', conceptId);
}

// ─── Edge Functions ───

export async function invokeAITutor(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke('ai-tutor', { body });
  if (error) throw error;
  return data;
}

export async function invokeGenerateQuestions(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke('generate-questions', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function invokeParseQuestions(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke('parse-questions', { body });
  if (error) throw error;
  return data;
}
