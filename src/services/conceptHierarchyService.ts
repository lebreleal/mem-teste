/**
 * conceptHierarchyService — Simplified service for the Error Notebook.
 * Fetches weak concepts with error links + their parent prerequisites in batch.
 * No recursive tree traversal — single-level parent lookup only.
 */
import { supabase } from '@/integrations/supabase/client';

export interface WeakConceptWithErrors {
  id: string;
  name: string;
  slug: string;
  state: number;
  stability: number;
  difficulty: number;
  correct_count: number;
  wrong_count: number;
  category: string | null;
  parent_concept_id: string | null;
  /** Parent concept info (if exists) */
  parent?: { id: string; name: string; state: number; stability: number } | null;
  /** Number of wrong attempts linked to this concept */
  errorCount: number;
  /** Question IDs that were answered incorrectly */
  errorQuestionIds: string[];
  /** Health derived from FSRS state */
  health: 'weak' | 'learning' | 'strong';
}

function getHealth(state: number, stability: number): 'weak' | 'learning' | 'strong' {
  if (state === 0 || state === 3) return 'weak';
  if (state === 1 || stability < 5) return 'learning';
  return 'strong';
}

/**
 * Fetch all weak concepts (state 0 or 3) that have at least one incorrectly-answered question.
 * Also fetches their parent concepts to show prerequisites.
 * Returns concepts sorted by stability (weakest first).
 */
export async function getWeakConceptsWithErrors(userId: string): Promise<WeakConceptWithErrors[]> {
  // 1. Get all latest attempts per question, filter to wrong ones
  const { data: attempts } = await supabase
    .from('deck_question_attempts' as any)
    .select('question_id, is_correct, answered_at')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false });

  if (!attempts || attempts.length === 0) return [];

  // Keep only latest attempt per question
  const latestByQ = new Map<string, any>();
  for (const a of attempts as any[]) {
    if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a);
  }

  const wrongQuestionIds = [...latestByQ.entries()]
    .filter(([_, a]) => !a.is_correct)
    .map(([qId]) => qId);

  if (wrongQuestionIds.length === 0) return [];

  // 2. Get concept links for wrong questions
  const { data: conceptLinks } = await supabase
    .from('question_concepts' as any)
    .select('question_id, concept_id')
    .in('question_id', wrongQuestionIds);

  if (!conceptLinks || conceptLinks.length === 0) return [];

  // Build concept → error question mapping
  const conceptErrorMap = new Map<string, string[]>();
  for (const link of conceptLinks as any[]) {
    if (!conceptErrorMap.has(link.concept_id)) conceptErrorMap.set(link.concept_id, []);
    conceptErrorMap.get(link.concept_id)!.push(link.question_id);
  }

  const conceptIds = [...conceptErrorMap.keys()];

  // 3. Fetch these concepts (only non-mastered: state != 2)
  const { data: concepts } = await supabase
    .from('global_concepts' as any)
    .select('id, name, slug, state, stability, difficulty, correct_count, wrong_count, category, parent_concept_id')
    .eq('user_id', userId)
    .in('id', conceptIds)
    .neq('state', 2); // Exclude mastered — they disappear from the list

  if (!concepts || concepts.length === 0) return [];

  // 4. Fetch parent concepts in batch
  const parentIds = [...new Set((concepts as any[]).map(c => c.parent_concept_id).filter(Boolean))];
  let parentMap = new Map<string, { id: string; name: string; state: number; stability: number }>();

  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('global_concepts' as any)
      .select('id, name, state, stability')
      .eq('user_id', userId)
      .in('id', parentIds);

    if (parents) {
      for (const p of parents as any[]) {
        parentMap.set(p.id, { id: p.id, name: p.name, state: p.state, stability: p.stability ?? 0 });
      }
    }
  }

  // 5. Build result
  const result: WeakConceptWithErrors[] = (concepts as any[]).map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    state: c.state,
    stability: c.stability ?? 0,
    difficulty: c.difficulty ?? 0,
    correct_count: c.correct_count ?? 0,
    wrong_count: c.wrong_count ?? 0,
    category: c.category,
    parent_concept_id: c.parent_concept_id,
    parent: c.parent_concept_id ? parentMap.get(c.parent_concept_id) ?? null : null,
    errorCount: conceptErrorMap.get(c.id)?.length ?? 0,
    errorQuestionIds: conceptErrorMap.get(c.id) ?? [],
    health: getHealth(c.state, c.stability ?? 0),
  }));

  // Sort: weakest first (lowest stability), then by error count desc
  result.sort((a, b) => {
    if (a.stability !== b.stability) return a.stability - b.stability;
    return b.errorCount - a.errorCount;
  });

  return result;
}
