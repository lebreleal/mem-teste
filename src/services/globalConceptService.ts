/**
 * globalConceptService — manages global concepts with FSRS scheduling.
 * Concepts are user-scoped Knowledge Components, independent of decks.
 * Questions link to concepts via the question_concepts junction table.
 */
import { supabase } from '@/integrations/supabase/client';

export interface GlobalConcept {
  id: string;
  user_id: string;
  name: string;
  slug: string;
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

// ─── Medical taxonomy (Estratégia MED / Medway / SanarFlix standard) ───
export const MEDICAL_CATEGORIES = [
  'Clínica Médica',
  'Cirurgia',
  'Ginecologia e Obstetrícia',
  'Pediatria',
  'Medicina Preventiva',
] as const;

export type MedicalCategory = typeof MEDICAL_CATEGORIES[number];

export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  'Clínica Médica': [
    'Cardiologia', 'Pneumologia', 'Gastroenterologia', 'Endocrinologia',
    'Nefrologia', 'Reumatologia', 'Hematologia', 'Infectologia',
    'Neurologia', 'Dermatologia', 'Psiquiatria', 'Geriatria',
    'Medicina Intensiva', 'Emergência Clínica',
  ],
  'Cirurgia': [
    'Cirurgia Geral', 'Cirurgia do Trauma', 'Cirurgia Vascular',
    'Urologia', 'Ortopedia', 'Neurocirurgia', 'Cirurgia Torácica',
    'Cirurgia Plástica', 'Otorrinolaringologia', 'Oftalmologia',
    'Anestesiologia', 'Cirurgia do Aparelho Digestivo',
  ],
  'Ginecologia e Obstetrícia': [
    'Obstetrícia', 'Ginecologia', 'Pré-natal', 'Parto',
    'Puerpério', 'Oncologia Ginecológica', 'Reprodução Humana',
    'Mastologia', 'Planejamento Familiar',
  ],
  'Pediatria': [
    'Neonatologia', 'Puericultura', 'Infectologia Pediátrica',
    'Pneumologia Pediátrica', 'Gastroenterologia Pediátrica',
    'Cardiologia Pediátrica', 'Neurologia Pediátrica',
    'Imunizações', 'Emergência Pediátrica', 'Nutrologia Pediátrica',
  ],
  'Medicina Preventiva': [
    'Epidemiologia', 'Bioestatística', 'SUS', 'Políticas de Saúde',
    'Saúde do Trabalhador', 'Vigilância Epidemiológica',
    'Atenção Primária', 'Saúde da Família', 'Ética Médica',
    'Medicina Legal', 'Medicina Baseada em Evidências',
  ],
};

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
  const { data: existing } = await supabase
    .from('global_concepts' as any)
    .select('id, slug')
    .eq('user_id', userId)
    .in('slug', slugs);

  for (const row of (existing ?? []) as any[]) {
    slugMap.set(row.slug, row.id);
  }

  // Insert missing
  const missingSlugs = slugs.filter(s => !slugMap.has(s));
  if (missingSlugs.length > 0) {
    const rows = missingSlugs.map(s => {
      const name = uniqueBySlug.get(s)!;
      const meta = conceptMetaMap?.get(s);
      return {
        user_id: userId,
        name,
        slug: s,
        ...(meta?.category ? { category: meta.category } : {}),
        ...(meta?.subcategory ? { subcategory: meta.subcategory } : {}),
      };
    });

    const { data: inserted, error } = await supabase
      .from('global_concepts' as any)
      .upsert(rows as any, { onConflict: 'user_id,slug', ignoreDuplicates: true })
      .select('id, slug');

    if (!error && inserted) {
      for (const row of inserted as any[]) {
        slugMap.set(row.slug, row.id);
      }
    }

    // If upsert with ignoreDuplicates didn't return existing rows, re-fetch
    for (const s of missingSlugs) {
      if (!slugMap.has(s)) {
        const { data: refetch } = await supabase
          .from('global_concepts' as any)
          .select('id')
          .eq('user_id', userId)
          .eq('slug', s)
          .maybeSingle();
        if (refetch) slugMap.set(s, (refetch as any).id);
      }
    }
  }

  return slugMap;
}

// ─── Link questions to global concepts (with prerequisite support) ──────────
export async function linkQuestionsToConcepts(
  userId: string,
  questionConceptPairs: { questionId: string; conceptNames: string[]; prerequisites?: string[]; category?: string; subcategory?: string }[],
) {
  // Collect all unique concept names + meta (concepts + prerequisites)
  const allNames = new Set<string>();
  const metaMap = new Map<string, { category?: string; subcategory?: string }>();
  const prerequisiteMap = new Map<string, string[]>(); // conceptSlug → prerequisiteNames[]

  for (const pair of questionConceptPairs) {
    for (const name of pair.conceptNames) {
      allNames.add(name);
      const slug = conceptSlug(name);
      if (pair.category && !metaMap.has(slug)) {
        metaMap.set(slug, { category: pair.category, subcategory: pair.subcategory });
      }
    }
    // Collect prerequisites
    if (pair.prerequisites && pair.prerequisites.length > 0) {
      for (const prereq of pair.prerequisites) {
        allNames.add(prereq);
      }
      // Map each concept to its prerequisites
      for (const name of pair.conceptNames) {
        const slug = conceptSlug(name);
        const existing = prerequisiteMap.get(slug) ?? [];
        prerequisiteMap.set(slug, [...existing, ...pair.prerequisites]);
      }
    }
  }

  const slugToId = await ensureGlobalConcepts(userId, Array.from(allNames), metaMap);

  // Set parent_concept_id for concepts that have prerequisites
  for (const [conceptSlugKey, prereqNames] of prerequisiteMap.entries()) {
    const conceptId = slugToId.get(conceptSlugKey);
    if (!conceptId || prereqNames.length === 0) continue;

    // Use the first prerequisite as parent (tree model, not DAG)
    const parentSlug = conceptSlug(prereqNames[0]);
    const parentId = slugToId.get(parentSlug);
    if (parentId && parentId !== conceptId) {
      // Only set if not already set (don't overwrite manual edits)
      const { data: existing } = await supabase
        .from('global_concepts' as any)
        .select('parent_concept_id')
        .eq('id', conceptId)
        .maybeSingle();

      if (existing && !(existing as any).parent_concept_id) {
        await supabase
          .from('global_concepts' as any)
          .update({ parent_concept_id: parentId } as any)
          .eq('id', conceptId);
      }
    }
  }

  // Build junction rows
  const rows: { question_id: string; concept_id: string }[] = [];
  for (const pair of questionConceptPairs) {
    for (const name of pair.conceptNames) {
      const slug = conceptSlug(name);
      const conceptId = slugToId.get(slug);
      if (conceptId) {
        rows.push({ question_id: pair.questionId, concept_id: conceptId });
      }
    }
  }

  if (rows.length === 0) return;

  // Upsert to avoid duplicates
  await supabase
    .from('question_concepts' as any)
    .upsert(rows as any, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });
}

// ─── Fetch all global concepts for a user ───────
export async function fetchGlobalConcepts(userId: string): Promise<GlobalConcept[]> {
  const { data, error } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .order('scheduled_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as GlobalConcept[];
}

// ─── Fetch due concepts (scheduled_date <= now) ──
export async function fetchDueConcepts(userId: string): Promise<GlobalConcept[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .lte('scheduled_date', now)
    .order('scheduled_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as GlobalConcept[];
}

// ─── Get a varied question for a concept ────────
// Prioritizes questions never answered or least recently answered
export async function getVariedQuestion(
  conceptId: string,
  userId: string,
): Promise<{ questionId: string; deckId: string; questionText: string; options: any; correctIndices: number[] | null; explanation: string; concepts: string[] } | null> {
  // Get all question IDs linked to this concept
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('question_id')
    .eq('concept_id', conceptId);

  if (!links || links.length === 0) return null;

  const questionIds = (links as any[]).map(l => l.question_id);

  // Get attempt counts per question for this user
  const { data: attempts } = await supabase
    .from('deck_question_attempts' as any)
    .select('question_id, answered_at')
    .eq('user_id', userId)
    .in('question_id', questionIds);

  // Build map: questionId → latest answered_at
  const lastAnswered = new Map<string, string>();
  for (const a of (attempts ?? []) as any[]) {
    const existing = lastAnswered.get(a.question_id);
    if (!existing || a.answered_at > existing) {
      lastAnswered.set(a.question_id, a.answered_at);
    }
  }

  // Sort: unanswered first, then oldest answered
  const sorted = [...questionIds].sort((a, b) => {
    const aDate = lastAnswered.get(a);
    const bDate = lastAnswered.get(b);
    if (!aDate && bDate) return -1;
    if (aDate && !bDate) return 1;
    if (!aDate && !bDate) return 0;
    return aDate! < bDate! ? -1 : 1;
  });

  // Pick the best candidate
  const bestId = sorted[0];

  const { data: question } = await supabase
    .from('deck_questions' as any)
    .select('id, deck_id, question_text, options, correct_indices, explanation, concepts')
    .eq('id', bestId)
    .maybeSingle();

  if (!question) return null;

  const q = question as any;
  return {
    questionId: q.id,
    deckId: q.deck_id,
    questionText: q.question_text,
    options: q.options,
    correctIndices: q.correct_indices,
    explanation: q.explanation,
    concepts: q.concepts ?? [],
  };
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
  const { error } = await supabase
    .from('global_concepts' as any)
    .update({ ...fields, updated_at: new Date().toISOString() } as any)
    .eq('id', conceptId);
  if (error) throw error;
}

// ─── Update concept mastery counts ──────────────
export async function updateConceptMastery(
  conceptId: string,
  isCorrect: boolean,
) {
  // First get current counts
  const { data: current } = await supabase
    .from('global_concepts' as any)
    .select('correct_count, wrong_count')
    .eq('id', conceptId)
    .maybeSingle();

  if (!current) return;

  const c = current as any;
  const newCorrect = (c.correct_count ?? 0) + (isCorrect ? 1 : 0);
  const newWrong = (c.wrong_count ?? 0) + (isCorrect ? 0 : 1);

  await supabase
    .from('global_concepts' as any)
    .update({
      correct_count: newCorrect,
      wrong_count: newWrong,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', conceptId);
}

// ─── Get question count per concept ─────────────
export async function getConceptQuestionCounts(
  conceptIds: string[],
): Promise<Map<string, number>> {
  if (conceptIds.length === 0) return new Map();

  const { data } = await supabase
    .from('question_concepts' as any)
    .select('concept_id')
    .in('concept_id', conceptIds);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    counts.set(row.concept_id, (counts.get(row.concept_id) ?? 0) + 1);
  }
  return counts;
}

// ─── Update concept metadata (name, category, subcategory, parent) ───
export async function updateConceptMeta(
  conceptId: string,
  fields: { name?: string; category?: string | null; subcategory?: string | null; parent_concept_id?: string | null },
) {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) {
    updates.name = fields.name.trim();
    updates.slug = conceptSlug(fields.name);
  }
  if (fields.category !== undefined) updates.category = fields.category;
  if (fields.subcategory !== undefined) updates.subcategory = fields.subcategory;
  if (fields.parent_concept_id !== undefined) updates.parent_concept_id = fields.parent_concept_id;

  const { error } = await supabase
    .from('global_concepts' as any)
    .update(updates as any)
    .eq('id', conceptId);
  if (error) throw error;
}

// ─── Cascade on error: reschedule weak ancestor concepts ───
export async function cascadeOnError(conceptId: string, userId: string): Promise<number> {
  let rescheduled = 0;
  let currentId: string | null = conceptId;
  const visited = new Set<string>();

  // Walk up parent_concept_id
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { data } = await supabase
      .from('global_concepts' as any)
      .select('id, parent_concept_id, state, stability')
      .eq('id', currentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) break;
    const row = data as any;

    // Skip the original concept itself
    if (row.id !== conceptId) {
      // If ancestor is weak (new/relearning or low stability), reschedule it to now
      if (row.state === 0 || row.state === 3 || row.stability < 5) {
        await supabase
          .from('global_concepts' as any)
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
  // Get all user concepts
  const { data: all } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId);

  if (!all || all.length === 0) return [];

  const concepts = all as unknown as GlobalConcept[];
  const byId = new Map(concepts.map(c => [c.id, c]));

  // A concept is "ready to learn" if:
  // 1. Its state is 0 (new) 
  // 2. Its parent_concept_id is null (no prereq) OR its parent is in state 2 (mastered)
  return concepts.filter(c => {
    if (c.state !== 0) return false;
    if (!c.parent_concept_id) return true; // no prereq → always ready
    const parent = byId.get(c.parent_concept_id);
    return parent && parent.state === 2; // parent mastered
  });
}

// ─── Delete concept ─────────────────────────────
export async function deleteConcept(conceptId: string) {
  // Remove question links first
  await supabase.from('question_concepts' as any).delete().eq('concept_id', conceptId);
  const { error } = await supabase.from('global_concepts' as any).delete().eq('id', conceptId);
  if (error) throw error;
}

// ─── Get linked questions for a concept ─────────
export async function getConceptQuestions(
  conceptId: string,
): Promise<{ id: string; questionText: string; deckId: string; deckName?: string }[]> {
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('question_id')
    .eq('concept_id', conceptId);

  if (!links || links.length === 0) return [];

  const qIds = (links as any[]).map(l => l.question_id);

  const { data: questions } = await supabase
    .from('deck_questions' as any)
    .select('id, question_text, deck_id')
    .in('id', qIds);

  if (!questions) return [];

  // Get deck names
  const deckIds = [...new Set((questions as any[]).map(q => q.deck_id))];
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name')
    .in('id', deckIds);

  const deckMap = new Map((decks ?? []).map(d => [d.id, d.name]));

  return (questions as any[]).map(q => ({
    id: q.id,
    questionText: q.question_text,
    deckId: q.deck_id,
    deckName: deckMap.get(q.deck_id),
  }));
}

// ─── Unlink a question from a concept ───────────
export async function unlinkQuestion(conceptId: string, questionId: string) {
  await supabase
    .from('question_concepts' as any)
    .delete()
    .eq('concept_id', conceptId)
    .eq('question_id', questionId);
}

// ─── Fetch official concept-tags (is_concept = true, is_official = true) ───
export async function fetchOfficialConcepts(): Promise<{ id: string; name: string; slug: string; description: string; parent_id: string | null }[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, slug, description, parent_id')
    .eq('is_official', true)
    .eq('is_concept', true)
    .order('name');

  if (error) throw error;
  return (data ?? []) as any[];
}

// ─── Fetch community concepts (from public turma decks via question_concepts) ───
export async function fetchCommunityConcepts(userId: string): Promise<GlobalConcept[]> {
  // Get concepts from other users that are linked to questions in public community decks
  const { data, error } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .neq('user_id', userId)
    .order('name')
    .limit(200);

  if (error) throw error;
  return (data ?? []) as unknown as GlobalConcept[];
}

// ─── Import a concept (official tag or community) into user's personal collection ───
export async function importConcept(
  userId: string,
  source: { name: string; category?: string; subcategory?: string; conceptTagId?: string },
): Promise<string> {
  const slug = conceptSlug(source.name);

  // Check if already exists
  const { data: existing } = await supabase
    .from('global_concepts' as any)
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) return (existing as any).id;

  const { data: inserted, error } = await supabase
    .from('global_concepts' as any)
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
  return (inserted as any).id;
}

// ─── Import concept with its linked questions and cards ───
export async function importConceptWithContent(
  userId: string,
  sourceConceptId: string,
  sourceConcept: { name: string; category?: string; subcategory?: string; conceptTagId?: string },
): Promise<{ conceptId: string; questionCount: number; cardCount: number }> {
  // 1. Create personal concept
  const conceptId = await importConcept(userId, sourceConcept);

  // 2. Get questions linked to the source concept
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('question_id')
    .eq('concept_id', sourceConceptId);

  if (!links || links.length === 0) return { conceptId, questionCount: 0, cardCount: 0 };

  const questionIds = (links as any[]).map(l => l.question_id);

  // 3. Get the actual questions
  const { data: questions } = await supabase
    .from('deck_questions' as any)
    .select('id, deck_id, question_text, options, correct_indices, correct_answer, explanation, concepts, question_type')
    .in('id', questionIds);

  if (!questions || questions.length === 0) return { conceptId, questionCount: 0, cardCount: 0 };

  // 4. Create a deck for imported content
  const deckName = `Importado: ${sourceConcept.name}`;
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .insert({ user_id: userId, name: deckName })
    .select('id')
    .single();

  if (deckError || !deck) return { conceptId, questionCount: 0, cardCount: 0 };

  // 5. Copy questions to the new deck
  const questionRows = (questions as any[]).map((q, i) => ({
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

  const { data: insertedQs } = await supabase
    .from('deck_questions' as any)
    .insert(questionRows as any)
    .select('id');

  // 6. Link new questions to user's concept
  if (insertedQs && insertedQs.length > 0) {
    const junctionRows = (insertedQs as any[]).map(q => ({
      question_id: q.id,
      concept_id: conceptId,
    }));
    await supabase
      .from('question_concepts' as any)
      .upsert(junctionRows as any, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });
  }

  // 7. Create basic review cards
  const cardRows = (questions as any[]).map(q => ({
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

// ─── Get concepts linked to a specific card ────
// Path: card.deck_id → deck_questions (same deck) → question_concepts → global_concepts
export async function getCardConcepts(
  cardId: string,
  userId: string,
): Promise<GlobalConcept[]> {
  // 1. Get the card's deck_id
  const { data: card } = await supabase
    .from('cards')
    .select('deck_id')
    .eq('id', cardId)
    .maybeSingle();

  if (!card) return [];

  // 2. Get all questions from the same deck
  const { data: questions } = await supabase
    .from('deck_questions' as any)
    .select('id')
    .eq('deck_id', (card as any).deck_id);

  if (!questions || questions.length === 0) return [];

  const questionIds = (questions as any[]).map(q => q.id);

  // 3. Get concept IDs linked to those questions
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('concept_id')
    .in('question_id', questionIds);

  if (!links || links.length === 0) return [];

  const conceptIds = [...new Set((links as any[]).map(l => l.concept_id))];

  // 4. Fetch the user's global concepts
  const { data: concepts } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .in('id', conceptIds)
    .order('stability', { ascending: true });

  return (concepts ?? []) as unknown as GlobalConcept[];
}

// ─── Get cards related to a concept across ALL user decks ───
// Looks up question_concepts → deck_questions → cards in those decks
export async function getConceptRelatedCards(
  conceptId: string,
  userId: string,
): Promise<{ id: string; front_content: string; back_content: string; deck_id: string }[]> {
  // 1. Get deck_ids from questions linked to this concept
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('question_id')
    .eq('concept_id', conceptId);

  if (!links || links.length === 0) return [];

  const questionIds = (links as any[]).map(l => l.question_id);

  // 2. Get deck_ids from those questions
  const { data: questions } = await supabase
    .from('deck_questions' as any)
    .select('deck_id')
    .in('id', questionIds);

  if (!questions || questions.length === 0) return [];

  const deckIds = [...new Set((questions as any[]).map((q: any) => q.deck_id))];

  // 3. Get cards from those decks (only user's own decks via RLS)
  const { data: cards } = await supabase
    .from('cards')
    .select('id, front_content, back_content, deck_id')
    .in('deck_id', deckIds)
    .limit(100);

  return (cards ?? []) as { id: string; front_content: string; back_content: string; deck_id: string }[];
}

// ─── Generate reinforcement cards via AI (Pro, zero cost) ───
// Used when leech trigger fires and no existing cards are found for the concept.
// Creates/updates a permanent "Reforço: {name}" deck so future sessions stay consistent.
// Cards are generated as didactic scaffolding to help answer the original difficult card.
export async function generateReinforcementCards(
  conceptNameOrContent: string,
  userId: string,
  targetCard?: { front_content?: string; back_content?: string },
): Promise<{ id: string; front_content: string; back_content: string; deck_id: string }[]> {
  const normalizeText = (value?: string) =>
    (value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const limitToThreeSentences = (value: string) => {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map(s => s.trim()).filter(Boolean) ?? [clean];
    return sentences.slice(0, 3).join(' ');
  };

  const normalizedConcept = conceptNameOrContent.trim() || 'Conceito';
  const deckName = `Reforço: ${normalizedConcept.slice(0, 60)}`;
  const targetFront = normalizeText(targetCard?.front_content).slice(0, 280);
  const targetBack = normalizeText(targetCard?.back_content).slice(0, 380);

  // Reuse deck identity (content will be refreshed to avoid stale/weak cards).
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('name', deckName)
    .maybeSingle();

  const textContent = [
    `Tema com dificuldade: ${normalizedConcept}.`,
    targetFront ? `Pergunta difícil alvo: ${targetFront}` : '',
    targetBack ? `Resposta esperada do card difícil: ${targetBack}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const customInstructions = `
Você é um professor especialista em recuperação de aprendizagem.

OBJETIVO OBRIGATÓRIO:
Depois destes cards, o aluno deve conseguir responder a PERGUNTA DIFÍCIL alvo com segurança.

COMO GERAR:
- Crie cards em sequência didática (degraus): pré-requisito → mecanismo → pista de diferenciação → aplicação curta.
- Cada pergunta deve ser útil para destravar a pergunta difícil alvo (evite perguntas genéricas).
- Escreva em português simples, sem jargão desnecessário.
- Se usar termo técnico, explique entre parênteses.
- Proibido cloze e múltipla escolha: use APENAS type "basic" (qa).

FORMATO DO VERSO (obrigatório):
1) Resposta direta (1 frase)
2) Explicação didática (máximo 2 frases)
3) Frase final: "Conexão com o card difícil: ..."

LIMITES:
- Front curto e claro.
- Back com no máximo 3 frases.
- Não invente conteúdo fora do contexto fornecido.
`.trim();

  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent,
      customInstructions,
      cardCount: 6,
      detailLevel: 'essential',
      cardFormats: ['qa'],
      aiModel: 'pro',
      energyCost: 0,
    },
  });

  if (error || data?.error) {
    console.error('generateReinforcementCards error:', error ?? data?.error);
    return [];
  }

  const generatedCards = Array.isArray(data?.cards) ? data.cards : [];
  if (generatedCards.length === 0) return [];

  let reinforcementDeckId = existingDeck?.id;
  if (!reinforcementDeckId) {
    const { data: createdDeck, error: deckError } = await supabase
      .from('decks')
      .insert({ user_id: userId, name: deckName })
      .select('id')
      .single();

    if (deckError || !createdDeck) {
      console.error('generateReinforcementCards deck create error:', deckError);
      return [];
    }

    reinforcementDeckId = createdDeck.id;
  }

  // Refresh deck content so previously weak generations are replaced.
  const { error: deleteError } = await supabase
    .from('cards')
    .delete()
    .eq('deck_id', reinforcementDeckId);

  if (deleteError) {
    console.error('generateReinforcementCards card cleanup error:', deleteError);
  }

  const cardRows = generatedCards
    .map((card: any) => ({
      deck_id: reinforcementDeckId,
      front_content: normalizeText(card?.front),
      back_content: limitToThreeSentences(normalizeText(card?.back)),
      card_type: 'basic',
    }))
    .filter((card: any) => card.front_content.length > 0 && card.back_content.length > 0);

  if (cardRows.length === 0) return [];

  const { data: insertedCards, error: insertError } = await supabase
    .from('cards')
    .insert(cardRows as any)
    .select('id, front_content, back_content, deck_id')
    .limit(10);

  if (insertError) {
    console.error('generateReinforcementCards card insert error:', insertError);
    return [];
  }

  return (insertedCards ?? []) as { id: string; front_content: string; back_content: string; deck_id: string }[];
}

// ─── Generate concept-focused questions via edge function ───
export async function generateConceptQuestions(
  cardIds: string[],
  aiModel: string = 'flash',
  energyCost: number = 0,
): Promise<{
  questions: Array<{
    question_text: string;
    options: string[];
    correct_index: number;
    explanation: string;
    concepts: string[];
    source_card_ids: string[];
  }>;
  usage: any;
} | null> {
  const { data, error } = await supabase.functions.invoke('generate-questions', {
    body: { cardIds, aiModel, energyCost, optionsCount: 4 },
  });

  if (error) {
    console.error('generateConceptQuestions error:', error);
    return null;
  }

  if (data?.error) {
    console.error('generateConceptQuestions AI error:', data.error);
    return null;
  }

  return data;
}

// ─── Auto-generate questions for a concept that has none ───
// Creates a small deck with cards about the concept, then generates questions from those cards,
// links them to the concept, and returns the first question.
export async function generateQuestionsForConcept(
  conceptId: string,
  conceptName: string,
  conceptCategory: string | null,
  userId: string,
): Promise<ReturnType<typeof getVariedQuestion>> {
  // 1. Generate cards about this concept via AI
  const textContent = [
    `Tema: ${conceptName}`,
    conceptCategory ? `Grande área: ${conceptCategory}` : '',
    `Crie flashcards sobre "${conceptName}" cobrindo: definição, fisiopatologia/mecanismo, quadro clínico, diagnóstico e tratamento (quando aplicável).`,
  ].filter(Boolean).join('\n');

  const customInstructions = `
Você é um professor de medicina criando material de estudo.
Crie cartões objetivos sobre "${conceptName}".
- Cada card deve cobrir UM aspecto do tema.
- Front: pergunta curta e direta.
- Back: resposta em 1-3 frases.
- APENAS type "basic" (qa).
`.trim();

  const { data: genData, error: genError } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent,
      customInstructions,
      cardCount: 4,
      detailLevel: 'essential',
      cardFormats: ['qa'],
      aiModel: 'flash',
      energyCost: 0,
    },
  });

  if (genError || genData?.error || !Array.isArray(genData?.cards) || genData.cards.length === 0) {
    console.error('generateQuestionsForConcept card gen error:', genError ?? genData?.error);
    return null;
  }

  // 2. Create/reuse deck
  const deckName = `Conceito: ${conceptName.slice(0, 60)}`;
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('name', deckName)
    .maybeSingle();

  let deckId = existingDeck?.id;
  if (!deckId) {
    const { data: newDeck, error: deckErr } = await supabase
      .from('decks')
      .insert({ user_id: userId, name: deckName })
      .select('id')
      .single();
    if (deckErr || !newDeck) return null;
    deckId = newDeck.id;
  }

  // 3. Insert cards
  const normalize = (v?: string) => (v ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cardRows = genData.cards
    .map((c: any) => ({
      deck_id: deckId,
      front_content: normalize(c?.front),
      back_content: normalize(c?.back),
      card_type: 'basic',
    }))
    .filter((c: any) => c.front_content.length > 0 && c.back_content.length > 0);

  if (cardRows.length === 0) return null;

  const { data: insertedCards } = await supabase
    .from('cards')
    .insert(cardRows as any)
    .select('id');

  if (!insertedCards || insertedCards.length === 0) return null;

  // 4. Generate questions from those cards
  const cardIds = insertedCards.map((c: any) => c.id);
  const { data: qData } = await supabase.functions.invoke('generate-questions', {
    body: { cardIds, aiModel: 'flash', energyCost: 0, optionsCount: 4 },
  });

  if (!qData?.questions || !Array.isArray(qData.questions) || qData.questions.length === 0) {
    return null;
  }

  // 5. Insert questions and link to concept
  const questionRows = qData.questions.map((q: any, i: number) => ({
    deck_id: deckId,
    created_by: userId,
    question_text: q.question_text,
    options: q.options,
    correct_indices: [q.correct_index ?? 0],
    correct_answer: q.options?.[q.correct_index ?? 0] ?? '',
    explanation: q.explanation ?? '',
    concepts: q.concepts ?? [conceptName],
    question_type: 'multiple_choice',
    sort_order: i,
  }));

  const { data: insertedQs } = await supabase
    .from('deck_questions' as any)
    .insert(questionRows as any)
    .select('id');

  if (!insertedQs || insertedQs.length === 0) return null;

  // Link questions to concept
  const junctionRows = (insertedQs as any[]).map(q => ({
    question_id: q.id,
    concept_id: conceptId,
  }));
  await supabase
    .from('question_concepts' as any)
    .upsert(junctionRows as any, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });

  // 6. Return the first question
  return getVariedQuestion(conceptId, userId);
}

// ─── Get or generate a question for a concept ───
// Tries getVariedQuestion first; if null, auto-generates questions then retries.
export async function getOrGenerateQuestion(
  conceptId: string,
  userId: string,
  conceptName: string,
  conceptCategory: string | null,
): Promise<{ question: ReturnType<typeof getVariedQuestion> extends Promise<infer T> ? T : never; wasGenerated: boolean }> {
  const existing = await getVariedQuestion(conceptId, userId);
  if (existing) return { question: existing, wasGenerated: false };

  // Auto-generate
  const generated = await generateQuestionsForConcept(conceptId, conceptName, conceptCategory, userId);
  return { question: generated, wasGenerated: true };
}

// ─── Map prerequisites via AI (batch) ───────────
export async function mapPrerequisitesViaAI(userId: string): Promise<number> {
  const { data: all } = await supabase
    .from('global_concepts' as any)
    .select('id, name, slug, parent_concept_id')
    .eq('user_id', userId);

  if (!all || all.length < 2) return 0;

  const concepts = all as any[];
  const names = concepts.map((c: any) => c.name);

  const { data, error } = await supabase.functions.invoke('map-prerequisites', {
    body: { conceptNames: names },
  });

  if (error || data?.error) {
    console.error('mapPrerequisitesViaAI error:', error ?? data?.error);
    throw new Error(data?.error ?? 'Failed to map prerequisites');
  }

  const pairs: { concept: string; prerequisite: string }[] = data?.pairs ?? [];
  if (pairs.length === 0) return 0;

  // Build name→id map (case-insensitive)
  const nameToId = new Map<string, string>();
  for (const c of concepts) {
    nameToId.set(c.name.toLowerCase(), c.id);
  }

  let updated = 0;
  for (const pair of pairs) {
    const conceptId = nameToId.get(pair.concept.toLowerCase());
    const prereqId = nameToId.get(pair.prerequisite.toLowerCase());
    if (!conceptId || !prereqId || conceptId === prereqId) continue;

    // Only set if not already set
    const existing = concepts.find((c: any) => c.id === conceptId);
    if (existing?.parent_concept_id) continue;

    await supabase
      .from('global_concepts' as any)
      .update({ parent_concept_id: prereqId, updated_at: new Date().toISOString() } as any)
      .eq('id', conceptId);
    updated++;
  }

  return updated;
}

// ─── Fetch concepts for diagnostic assessment ───
// Selects ~20 concepts distributed across different depths
export async function fetchDiagnosticConcepts(userId: string): Promise<GlobalConcept[]> {
  const { data: all } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId);

  if (!all || all.length === 0) return [];

  const concepts = all as unknown as GlobalConcept[];
  const byId = new Map(concepts.map(c => [c.id, c]));

  // Calculate depth for each concept
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

  // Group by depth
  const byDepth = new Map<number, GlobalConcept[]>();
  for (const c of concepts) {
    const d = getDepth(c);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(c);
  }

  // Sample evenly across depths, target ~20
  const target = Math.min(20, concepts.length);
  const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
  const perDepth = Math.max(1, Math.ceil(target / depths.length));

  const selected: GlobalConcept[] = [];
  for (const d of depths) {
    const pool = byDepth.get(d)!;
    // Shuffle and take perDepth
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, perDepth));
    if (selected.length >= target) break;
  }

  return selected.slice(0, target);
}

// ─── Mark concept as mastered (for diagnostic) ───
// Uses FSRS properly: simulates 2x Good ratings on a new card to get real stability/difficulty
export async function markConceptMastered(conceptId: string) {
  const { fsrsSchedule, DEFAULT_FSRS_PARAMS } = await import('@/lib/fsrs');
  const params = { ...DEFAULT_FSRS_PARAMS, learningSteps: [10, 1440], relearningSteps: [10] };

  // First "Good" on a new card → enters learning
  const first = fsrsSchedule(
    { stability: 0, difficulty: 0, state: 0, scheduled_date: new Date().toISOString(), learning_step: 0 },
    3, params,
  );

  // Second "Good" → graduates or advances
  const second = fsrsSchedule(
    { stability: first.stability, difficulty: first.difficulty, state: first.state, scheduled_date: first.scheduled_date, learning_step: first.learning_step, last_reviewed_at: new Date().toISOString() },
    3, params,
  );

  await supabase
    .from('global_concepts' as any)
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
  await supabase
    .from('global_concepts' as any)
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
