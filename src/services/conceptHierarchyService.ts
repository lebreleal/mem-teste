/**
 * conceptHierarchyService — Service for the Weak Concepts page.
 * Fetches weak/new concepts with error links + cascaded ancestors.
 * Includes concepts without errors that were rescheduled by cascade.
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
  scheduled_date: string;
  /** Parent concept info (if exists) */
  parent?: { id: string; name: string; state: number; stability: number } | null;
  /** Number of wrong attempts linked to this concept */
  errorCount: number;
  /** Question IDs that were answered incorrectly */
  errorQuestionIds: string[];
  /** Health derived from FSRS state */
  health: 'weak' | 'learning' | 'strong';
  /** Whether this concept is currently due for review */
  isDue: boolean;
  /** Whether this concept came from a cascade (rescheduled prerequisite) */
  isCascaded: boolean;
}

function getHealth(state: number, stability: number): 'weak' | 'learning' | 'strong' {
  if (state === 0 || state === 3) return 'weak';
  if (state === 1 || stability < 5) return 'learning';
  return 'strong';
}

/**
 * Fetch all weak concepts (state 0, 1, or 3) that either:
 * - Have at least one incorrectly-answered question, OR
 * - Were rescheduled by cascade (scheduled_date <= now, state != 2)
 * 
 * Returns concepts sorted by: due first, then by stability (weakest first).
 */
export async function getWeakConceptsWithErrors(userId: string): Promise<WeakConceptWithErrors[]> {
  const now = new Date().toISOString();

  // 1. Get all latest attempts per question, filter to wrong ones
  const { data: attempts } = await supabase
    .from('deck_question_attempts' as any)
    .select('question_id, is_correct, answered_at')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false });

  if (!attempts || attempts.length === 0) return [];

  // Keep only latest attempt per question
  const latestByQ = new Map<string, any>();
  for (const a of (attempts ?? []) as any[]) {
    if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a);
  }

  const wrongQuestionIds = [...latestByQ.entries()]
    .filter(([_, a]) => !a.is_correct)
    .map(([qId]) => qId);

  // 2. Get concept links for wrong questions
  let conceptErrorMap = new Map<string, string[]>();
  if (wrongQuestionIds.length > 0) {
    const { data: conceptLinks } = await supabase
      .from('question_concepts' as any)
      .select('question_id, concept_id')
      .in('question_id', wrongQuestionIds);

    for (const link of (conceptLinks ?? []) as any[]) {
      if (!conceptErrorMap.has(link.concept_id)) conceptErrorMap.set(link.concept_id, []);
      conceptErrorMap.get(link.concept_id)!.push(link.question_id);
    }
  }

  const conceptIdsWithErrors = [...conceptErrorMap.keys()];

  // 3. Fetch ALL non-mastered concepts (state != 2) that are either:
  //    a) Have errors, OR b) Are due (cascaded or naturally due)
  const { data: concepts } = await supabase
    .from('global_concepts' as any)
    .select('id, name, slug, state, stability, difficulty, correct_count, wrong_count, category, parent_concept_id, scheduled_date')
    .eq('user_id', userId)
    .neq('state', 2); // Exclude mastered

  if (!concepts || concepts.length === 0) return [];

  // Filter: include if has errors OR is due
  const relevant = (concepts as any[]).filter(c => {
    const hasErrors = conceptErrorMap.has(c.id);
    const isDue = c.scheduled_date <= now;
    return hasErrors || isDue;
  });

  if (relevant.length === 0) return [];

  // 4. Fetch parent concepts in batch
  const parentIds = [...new Set(relevant.map(c => c.parent_concept_id).filter(Boolean))];
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
  const result: WeakConceptWithErrors[] = relevant.map(c => {
    const isDue = c.scheduled_date <= now;
    const hasErrors = conceptErrorMap.has(c.id);
    return {
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
      scheduled_date: c.scheduled_date,
      parent: c.parent_concept_id ? parentMap.get(c.parent_concept_id) ?? null : null,
      errorCount: conceptErrorMap.get(c.id)?.length ?? 0,
      errorQuestionIds: conceptErrorMap.get(c.id) ?? [],
      health: getHealth(c.state, c.stability ?? 0),
      isDue,
      isCascaded: !hasErrors && isDue, // Due but no own errors = came from cascade
    };
  });

  // Sort: due first, then weakest (lowest stability), then by error count desc
  result.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    if (a.stability !== b.stability) return a.stability - b.stability;
    return b.errorCount - a.errorCount;
  });

  return result;
}
