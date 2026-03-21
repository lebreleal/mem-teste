/**
 * UI Query Service — shared query functions used by multiple UI components.
 * Extracted per Lei 2A: components MUST NOT import supabase directly.
 * Groups miscellaneous queries that don't belong to a specific domain service.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Deck Hierarchy ───

/** BFS to get all descendant deck IDs from a root deck. */
export async function fetchDeckHierarchyIds(rootDeckId: string, userId?: string): Promise<string[]> {
  const allIds: string[] = [rootDeckId];
  let frontier = [rootDeckId];
  while (frontier.length > 0) {
    let query = supabase.from('decks').select('id').in('parent_deck_id', frontier);
    if (userId) query = query.eq('user_id', userId);
    const { data: children } = await query;
    if (!children || children.length === 0) break;
    const childIds = children.map((d: { id: string }) => d.id);
    allIds.push(...childIds);
    frontier = childIds;
  }
  return allIds;
}

// Question stats removed

// ─── Concept Cards ───

export async function fetchConceptCardIds(conceptId: string): Promise<string[]> {
  const { data } = await supabase
    .from('concept_cards')
    .select('card_id')
    .eq('concept_id', conceptId);
  return (data ?? []).map((r: { card_id: string }) => r.card_id);
}

// ─── Deck Concepts (contextual) ───

export interface DeckConcept {
  id: string;
  name: string;
  state: number;
  correct_count: number;
  wrong_count: number;
}

export async function fetchDeckConceptsByHierarchy(deckId: string, userId: string): Promise<DeckConcept[]> {
  const allDeckIds = await fetchDeckHierarchyIds(deckId, userId);

  // Get question IDs
  const { data: questions } = await supabase
    .from('deck_questions')
    .select('id')
    .in('deck_id', allDeckIds);
  if (!questions || questions.length === 0) return [];

  const qIds = (questions as Array<{ id: string }>).map(q => q.id);

  // Get concept IDs linked to questions (batched)
  const allConceptIds: string[] = [];
  for (let i = 0; i < qIds.length; i += 100) {
    const batch = qIds.slice(i, i + 100);
    const { data: links } = await supabase
      .from('question_concepts')
      .select('concept_id')
      .in('question_id', batch);
    if (links) allConceptIds.push(...(links as Array<{ concept_id: string }>).map(l => l.concept_id));
  }
  if (allConceptIds.length === 0) return [];

  const uniqueConceptIds = [...new Set(allConceptIds)];
  const { data: gc } = await supabase
    .from('global_concepts')
    .select('id, name, state, correct_count, wrong_count')
    .eq('user_id', userId)
    .in('id', uniqueConceptIds);

  return (gc ?? []) as unknown as DeckConcept[];
}

// ─── Global Concepts by slug ───

export interface ConceptBySlug {
  id: string;
  name: string;
  state: number;
  stability: number;
}

export async function fetchConceptsBySlug(userId: string, slugs: string[]): Promise<ConceptBySlug[]> {
  const { data } = await supabase
    .from('global_concepts')
    .select('id, name, state, stability')
    .eq('user_id', userId)
    .in('slug', slugs);
  return (data ?? []) as unknown as ConceptBySlug[];
}

// ─── Trial cards ───

export interface TrialCard {
  id: string;
  front_content: string;
  back_content: string;
  card_type: string;
  stability: number;
  difficulty: number;
  state: number;
  scheduled_date: string;
  last_reviewed_at: string | null;
}

export async function fetchTrialCards(deckId: string): Promise<TrialCard[]> {
  const { data } = await supabase.from('cards')
    .select('id, front_content, back_content, card_type, stability, difficulty, state, scheduled_date, last_reviewed_at')
    .eq('deck_id', deckId);
  return (data ?? []) as unknown as TrialCard[];
}

// ─── Deck daily limit update (batch) ───

export async function updateDeckDailyLimits(updates: Array<{ id: string; daily_new_limit: number }>): Promise<void> {
  await Promise.all(
    updates.map(u =>
      supabase.from('decks').update({ daily_new_limit: u.daily_new_limit }).eq('id', u.id)
    )
  );
}

// ─── Global deck settings update (batch) ───

/** Update learning_steps and easy_graduating_interval for ALL user decks. */
export async function updateGlobalDeckSettings(
  userId: string,
  settings: { learning_steps?: string[]; easy_graduating_interval?: number },
): Promise<void> {
  const { error } = await supabase
    .from('decks')
    .update(settings)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Fetch global study settings from the first deck (they're the same globally). */
export async function fetchGlobalStudySettings(userId: string): Promise<{ learning_steps: string[]; easy_graduating_interval: number } | null> {
  const { data } = await supabase
    .from('decks')
    .select('learning_steps, easy_graduating_interval')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    learning_steps: (data as { learning_steps: string[]; easy_graduating_interval: number }).learning_steps ?? ['1m', '10m'],
    easy_graduating_interval: (data as { learning_steps: string[]; easy_graduating_interval: number }).easy_graduating_interval ?? 15,
  };
}

// ─── Card front content fetch (for cloze editing) ───

export async function fetchCardFrontContent(cardId: string): Promise<string | null> {
  const { data } = await supabase.from('cards').select('front_content').eq('id', cardId).single();
  return data?.front_content ?? null;
}

// ─── Personal exams for import ───

export interface PersonalExam {
  id: string;
  title: string;
  total_points: number;
  time_limit_seconds: number | null;
  created_at: string;
}

export async function fetchPersonalExams(userId: string): Promise<PersonalExam[]> {
  const { data } = await supabase.from('exams')
    .select('id, title, total_points, time_limit_seconds, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as PersonalExam[];
}

export async function fetchExamQuestionCounts(examIds: string[]): Promise<Record<string, number>> {
  if (examIds.length === 0) return {};
  const { data } = await supabase.from('exam_questions').select('exam_id').in('exam_id', examIds);
  const counts: Record<string, number> = {};
  (data ?? []).forEach((q: { exam_id: string }) => { counts[q.exam_id] = (counts[q.exam_id] || 0) + 1; });
  return counts;
}

// ─── AI Source file download ───

export async function downloadAISourceFile(filePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('ai-sources').download(filePath);
  if (error || !data) throw error || new Error('Download failed');
  return data;
}
