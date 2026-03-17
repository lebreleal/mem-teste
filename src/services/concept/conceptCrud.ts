/**
 * conceptCrud — CRUD básico de global_concepts.
 * Extracted from globalConceptService.ts (copy-paste integral).
 */
import { supabase } from '@/integrations/supabase/client';

export const GLOBAL_CONCEPT_COLS = 'id, user_id, name, slug, description, category, subcategory, parent_concept_id, concept_tag_id, state, stability, difficulty, scheduled_date, learning_step, last_reviewed_at, correct_count, wrong_count, created_at, updated_at' as const;

export interface GlobalConcept {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  parent_concept_id: string | null;
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
  learning_step: number;
  last_reviewed_at: string | null;
  correct_count: number;
  wrong_count: number;
  created_at: string;
  updated_at: string;
}

// Row interfaces for query results
interface ConceptSlugRow { id: string; slug: string }
interface ConceptIdRow { id: string }
interface OfficialTagRow { id: string; name: string; slug: string; description: string; parent_id: string | null }
interface ConceptSlugOnlyRow { slug: string }

// Helper to access global_concepts table (not in generated types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gcTable = () => supabase.from('global_concepts' as 'cards') as ReturnType<typeof supabase.from>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qcTable = () => supabase.from('question_concepts' as 'cards') as ReturnType<typeof supabase.from>;

// ─── Slug normalization ─────────────────────────
export function conceptSlug(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

// ─── Ensure global concepts exist for a list of concept names ───
// Returns a map of slug → concept id
export async function ensureGlobalConcepts(
  userId: string,
  conceptNames: string[],
  conceptMetaMap?: Map<string, { category?: string; subcategory?: string; parentConceptSlug?: string }>,
  descriptionMap?: Map<string, string>,
): Promise<Map<string, string>> {
  const slugMap = new Map<string, string>(); // slug → id
  if (conceptNames.length === 0) return slugMap;

  const uniqueBySlug = new Map<string, string>(); // slug → display name
  for (const name of conceptNames) {
    const s = conceptSlug(name);
    if (s && !uniqueBySlug.has(s)) uniqueBySlug.set(s, name.trim());
  }

  const slugs = Array.from(uniqueBySlug.keys());

  // Fetch existing
  const { data: existing } = await gcTable()
    .select('id, slug')
    .eq('user_id', userId)
    .in('slug', slugs);

  for (const row of ((existing ?? []) as unknown as ConceptSlugRow[])) {
    slugMap.set(row.slug, row.id);
  }

  // Insert missing
  const missingSlugs = slugs.filter(s => !slugMap.has(s));
  if (missingSlugs.length > 0) {
    const rows = missingSlugs.map(s => {
      const name = uniqueBySlug.get(s)!;
      const meta = conceptMetaMap?.get(s);
      const desc = descriptionMap?.get(s) ?? descriptionMap?.get(name);
      return {
        user_id: userId,
        name,
        slug: s,
        ...(meta?.category ? { category: meta.category } : {}),
        ...(meta?.subcategory ? { subcategory: meta.subcategory } : {}),
        ...(desc ? { description: desc } : {}),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await gcTable()
      .upsert(rows as any, { onConflict: 'user_id,slug', ignoreDuplicates: true })
      .select('id, slug');

    if (!error && inserted) {
      for (const row of (inserted as unknown as ConceptSlugRow[])) {
        slugMap.set(row.slug, row.id);
      }
    }

    // If upsert with ignoreDuplicates didn't return existing rows, re-fetch
    for (const s of missingSlugs) {
      if (!slugMap.has(s)) {
        const { data: refetch } = await gcTable()
          .select('id')
          .eq('user_id', userId)
          .eq('slug', s)
          .maybeSingle();
        if (refetch) slugMap.set(s, (refetch as unknown as ConceptIdRow).id);
      }
    }
  }

  return slugMap;
}

// ─── Fetch all global concepts for a user ───────
export async function fetchGlobalConcepts(userId: string): Promise<GlobalConcept[]> {
  const { data, error } = await gcTable()
    .select(GLOBAL_CONCEPT_COLS)
    .eq('user_id', userId)
    .order('scheduled_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as GlobalConcept[];
}

// ─── Update concept metadata (name, category, subcategory, parent) ───
export async function updateConceptMeta(
  conceptId: string,
  fields: { name?: string; category?: string | null; subcategory?: string | null; parent_concept_id?: string | null },
) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) {
    updates.name = fields.name.trim();
    updates.slug = conceptSlug(fields.name);
  }
  if (fields.category !== undefined) updates.category = fields.category;
  if (fields.subcategory !== undefined) updates.subcategory = fields.subcategory;
  if (fields.parent_concept_id !== undefined) updates.parent_concept_id = fields.parent_concept_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await gcTable().update(updates as any).eq('id', conceptId);
  if (error) throw error;
}

// ─── Delete concept ─────────────────────────────
export async function deleteConcept(conceptId: string) {
  // Remove question links first
  await qcTable().delete().eq('concept_id', conceptId);
  const { error } = await gcTable().delete().eq('id', conceptId);
  if (error) throw error;
}

// ─── Fetch official concept-tags (is_concept = true, is_official = true) ───
export async function fetchOfficialConcepts(): Promise<OfficialTagRow[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, slug, description, parent_id')
    .eq('is_official', true)
    .eq('is_concept', true)
    .order('name');

  if (error) throw error;
  return (data ?? []) as unknown as OfficialTagRow[];
}

// ─── Fetch community concepts (official concept tags the user hasn't imported yet) ───
export async function fetchCommunityConcepts(userId: string): Promise<GlobalConcept[]> {
  const { data: officialTags, error: tagErr } = await supabase
    .from('tags')
    .select('id, name, slug, description, parent_id')
    .eq('is_official', true)
    .eq('is_concept', true)
    .order('name')
    .limit(200);

  if (tagErr) throw tagErr;
  if (!officialTags || officialTags.length === 0) return [];

  const { data: userConcepts } = await gcTable()
    .select('slug')
    .eq('user_id', userId);

  const existingSlugs = new Set(((userConcepts ?? []) as unknown as ConceptSlugOnlyRow[]).map(c => c.slug));

  return (officialTags as unknown as OfficialTagRow[])
    .filter(t => !existingSlugs.has(t.slug))
    .map(t => ({
      id: t.id,
      user_id: '',
      name: t.name,
      slug: t.slug,
      category: null,
      subcategory: null,
      state: 0,
      stability: 0,
      difficulty: 0,
      scheduled_date: new Date().toISOString(),
      learning_step: 0,
      last_reviewed_at: null,
      correct_count: 0,
      wrong_count: 0,
      parent_concept_id: null,
      concept_tag_id: t.id,
      description: null,
      created_at: '',
      updated_at: '',
    })) as GlobalConcept[];
}

// ─── Import a concept (official tag or community) into user's personal collection ───
export async function importConcept(
  userId: string,
  source: { name: string; category?: string; subcategory?: string; conceptTagId?: string },
): Promise<string> {
  const slug = conceptSlug(source.name);

  const { data: existing } = await gcTable()
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) return (existing as unknown as ConceptIdRow).id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await gcTable()
    .insert({
      user_id: userId,
      name: source.name.trim(),
      slug,
      category: source.category ?? null,
      subcategory: source.subcategory ?? null,
      concept_tag_id: source.conceptTagId ?? null,
    } as any)
    .select('id')
    .single();

  if (error) throw error;
  return (inserted as unknown as ConceptIdRow).id;
}

// ─── Import concept with its linked questions and cards ───
export async function importConceptWithContent(
  userId: string,
  sourceConceptId: string,
  sourceConcept: { name: string; category?: string; subcategory?: string; conceptTagId?: string },
): Promise<{ conceptId: string; questionCount: number; cardCount: number }> {
  const conceptId = await importConcept(userId, sourceConcept);

  interface QuestionLinkRow { question_id: string }
  const { data: links } = await qcTable()
    .select('question_id')
    .eq('concept_id', sourceConceptId);

  if (!links || links.length === 0) return { conceptId, questionCount: 0, cardCount: 0 };

  const questionIds = (links as unknown as QuestionLinkRow[]).map(l => l.question_id);

  interface QuestionRow {
    id: string; deck_id: string; question_text: string; options: unknown;
    correct_indices: number[] | null; correct_answer: string; explanation: string;
    concepts: string[] | null; question_type: string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dqTable = () => supabase.from('deck_questions' as 'cards') as ReturnType<typeof supabase.from>;

  const { data: questions } = await dqTable()
    .select('id, deck_id, question_text, options, correct_indices, correct_answer, explanation, concepts, question_type')
    .in('id', questionIds);

  if (!questions || questions.length === 0) return { conceptId, questionCount: 0, cardCount: 0 };

  const typedQuestions = questions as unknown as QuestionRow[];

  const deckName = `Importado: ${sourceConcept.name}`;
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .insert({ user_id: userId, name: deckName })
    .select('id')
    .single();

  if (deckError || !deck) return { conceptId, questionCount: 0, cardCount: 0 };

  const questionRows = typedQuestions.map((q, i) => ({
    deck_id: deck.id,
    created_by: userId,
    question_text: q.question_text,
    options: q.options,
    correct_indices: q.correct_indices,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
    concepts: q.concepts,
    question_type: q.question_type,
    sort_order: i,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedQs } = await dqTable()
    .insert(questionRows as any)
    .select('id');

  if (insertedQs && insertedQs.length > 0) {
    const junctionRows = (insertedQs as unknown as ConceptIdRow[]).map(q => ({
      question_id: q.id,
      concept_id: conceptId,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await qcTable()
      .upsert(junctionRows as any, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });
  }

  const cardRows = typedQuestions.map(q => ({
    deck_id: deck.id,
    front_content: sourceConcept.name,
    back_content: q.explanation || q.question_text,
    card_type: 'basic',
  }));

  const { data: insertedCards } = await supabase
    .from('cards')
    .insert(cardRows)
    .select('id');

  return {
    conceptId,
    questionCount: insertedQs?.length ?? 0,
    cardCount: insertedCards?.length ?? 0,
  };
}
