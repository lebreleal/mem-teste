/**
 * conceptScheduling — FSRS scheduling + diagnostic + mastery for global concepts.
 * Extracted from globalConceptService.ts (copy-paste integral).
 */
import { supabase } from '@/integrations/supabase/client';
import { GLOBAL_CONCEPT_COLS, type GlobalConcept } from './conceptCrud';

// Helper to access global_concepts table (not in generated types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gcTable = () => supabase.from('global_concepts' as 'cards') as ReturnType<typeof supabase.from>;

interface ConceptAncestorRow {
  id: string;
  parent_concept_id: string | null;
  state: number;
  stability: number;
}

interface ConceptCountsRow {
  correct_count: number;
  wrong_count: number;
}

// ─── Fetch due concepts (scheduled_date <= now) ──
export async function fetchDueConcepts(userId: string): Promise<GlobalConcept[]> {
  const now = new Date().toISOString();
  const { data, error } = await gcTable()
    .select(GLOBAL_CONCEPT_COLS)
    .eq('user_id', userId)
    .lte('scheduled_date', now)
    .order('scheduled_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as GlobalConcept[];
}

// ─── Update concept FSRS after review ───────────
export async function updateConceptFsrs(
  conceptId: string,
  fields: {
    state: number;
    stability: number;
    difficulty: number;
    scheduled_date: string;
    learning_step: number;
    last_reviewed_at: string;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await gcTable()
    .update({ ...fields, updated_at: new Date().toISOString() } as any)
    .eq('id', conceptId);
  if (error) throw error;
}

// ─── Update concept mastery counts (atomic increment) ──────────────
export async function updateConceptMastery(
  conceptId: string,
  isCorrect: boolean,
) {
  const field = isCorrect ? 'correct_count' : 'wrong_count';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('increment_concept_count', {
    p_concept_id: conceptId,
    p_field: field,
  });

  // Fallback to non-atomic if RPC doesn't exist yet
  if (error) {
    const { data: current } = await gcTable()
      .select('correct_count, wrong_count')
      .eq('id', conceptId)
      .maybeSingle();

    if (!current) return;

    const c = current as unknown as ConceptCountsRow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await gcTable()
      .update({
        correct_count: (c.correct_count ?? 0) + (isCorrect ? 1 : 0),
        wrong_count: (c.wrong_count ?? 0) + (isCorrect ? 0 : 1),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', conceptId);
  }
}

// ─── Cascade on error: reschedule weak ancestor concepts ───
export async function cascadeOnError(conceptId: string, userId: string): Promise<number> {
  let rescheduled = 0;
  let currentId: string | null = conceptId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { data } = await gcTable()
      .select('id, parent_concept_id, state, stability')
      .eq('id', currentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) break;
    const row = data as unknown as ConceptAncestorRow;

    if (row.id !== conceptId) {
      if (row.state === 0 || row.state === 3 || row.stability < 5) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await gcTable()
          .update({
            scheduled_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', row.id);
        rescheduled++;
      }
    }

    currentId = row.parent_concept_id;
  }

  return rescheduled;
}

// ─── Fetch "ready to learn" concepts (prerequisites mastered, concept is new) ───
export async function fetchReadyToLearnConcepts(userId: string): Promise<GlobalConcept[]> {
  const { data: all } = await gcTable()
    .select(GLOBAL_CONCEPT_COLS)
    .eq('user_id', userId);

  if (!all || all.length === 0) return [];

  const concepts = all as unknown as GlobalConcept[];
  const byId = new Map(concepts.map(c => [c.id, c]));

  return concepts.filter(c => {
    if (c.state !== 0) return false;
    if (!c.parent_concept_id) return true;
    const parent = byId.get(c.parent_concept_id);
    return parent && parent.state === 2;
  });
}

// ─── Fetch concepts for diagnostic assessment ───
export async function fetchDiagnosticConcepts(userId: string): Promise<GlobalConcept[]> {
  const { data: all } = await gcTable()
    .select(GLOBAL_CONCEPT_COLS)
    .eq('user_id', userId);

  if (!all || all.length === 0) return [];

  const concepts = all as unknown as GlobalConcept[];
  const byId = new Map(concepts.map(c => [c.id, c]));

  const getDepth = (c: GlobalConcept): number => {
    let depth = 0;
    let current = c;
    const visited = new Set<string>();
    while (current.parent_concept_id && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parent_concept_id);
      if (!parent) break;
      depth++;
      current = parent;
    }
    return depth;
  };

  const byDepth = new Map<number, GlobalConcept[]>();
  for (const c of concepts) {
    const d = getDepth(c);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(c);
  }

  const target = Math.min(20, concepts.length);
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  const perDepth = Math.max(1, Math.ceil(target / depths.length));

  const selected: GlobalConcept[] = [];
  for (const d of depths) {
    const pool = byDepth.get(d)!;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, perDepth));
    if (selected.length >= target) break;
  }

  return selected.slice(0, target);
}

// ─── Mark concept as mastered (for diagnostic) ───
export async function markConceptMastered(conceptId: string) {
  const { fsrsSchedule, DEFAULT_FSRS_PARAMS } = await import('@/lib/fsrs');
  const params = { ...DEFAULT_FSRS_PARAMS, learningSteps: [10, 1440], relearningSteps: [10] };

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const first = fsrsSchedule(
    { stability: 0, difficulty: 0, state: 0, scheduled_date: tenMinAgo, learning_step: 0 },
    3, params,
  );

  const dayAgo = new Date(Date.now() - 1440 * 60 * 1000).toISOString();
  const second = fsrsSchedule(
    { stability: first.stability, difficulty: first.difficulty, state: first.state, scheduled_date: new Date().toISOString(), learning_step: first.learning_step, last_reviewed_at: dayAgo },
    3, params,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await gcTable()
    .update({
      state: second.state,
      stability: second.stability,
      difficulty: second.difficulty,
      scheduled_date: second.scheduled_date,
      learning_step: second.learning_step,
      last_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', conceptId);
}

// ─── Mark concept as weak (for diagnostic) ───
export async function markConceptWeak(conceptId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await gcTable()
    .update({
      state: 0,
      stability: 0,
      difficulty: 0,
      scheduled_date: new Date().toISOString(),
      learning_step: 0,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', conceptId);
}
