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
  conceptMetaMap?: Map<string, { category?: string; subcategory?: string }>,
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

// ─── Link questions to global concepts ──────────
export async function linkQuestionsToConcepts(
  userId: string,
  questionConceptPairs: { questionId: string; conceptNames: string[]; category?: string; subcategory?: string }[],
) {
  // Collect all unique concept names + meta
  const allNames = new Set<string>();
  const metaMap = new Map<string, { category?: string; subcategory?: string }>();
  for (const pair of questionConceptPairs) {
    for (const name of pair.conceptNames) {
      allNames.add(name);
      const slug = conceptSlug(name);
      if (pair.category && !metaMap.has(slug)) {
        metaMap.set(slug, { category: pair.category, subcategory: pair.subcategory });
      }
    }
  }

  const slugToId = await ensureGlobalConcepts(userId, Array.from(allNames), metaMap);

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

// ─── Update concept metadata (name, category, subcategory) ───
export async function updateConceptMeta(
  conceptId: string,
  fields: { name?: string; category?: string | null; subcategory?: string | null },
) {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (fields.name !== undefined) {
    updates.name = fields.name.trim();
    updates.slug = conceptSlug(fields.name);
  }
  if (fields.category !== undefined) updates.category = fields.category;
  if (fields.subcategory !== undefined) updates.subcategory = fields.subcategory;

  const { error } = await supabase
    .from('global_concepts' as any)
    .update(updates as any)
    .eq('id', conceptId);
  if (error) throw error;
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
// Creates a permanent "Reforço: {name}" deck so future lookups find them.
export async function generateReinforcementCards(
  conceptNameOrContent: string,
  userId: string,
): Promise<{ id: string; front_content: string; back_content: string; deck_id: string }[]> {
  const normalizedConcept = conceptNameOrContent.trim() || 'Conceito';
  const deckName = `Reforço: ${normalizedConcept.slice(0, 60)}`;

  // Reuse deck if it already exists
  const { data: existingDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('name', deckName)
    .maybeSingle();

  if (existingDeck) {
    const { data: cards } = await supabase
      .from('cards')
      .select('id, front_content, back_content, deck_id')
      .eq('deck_id', existingDeck.id)
      .limit(10);

    if ((cards?.length ?? 0) > 0) {
      return (cards ?? []) as { id: string; front_content: string; back_content: string; deck_id: string }[];
    }
  }

  const prompt = `Explique detalhadamente o seguinte tema médico: "${normalizedConcept}". ` +
    `Cubra: definição, fisiopatologia/mecanismo, etiologia, quadro clínico, diagnóstico e tratamento. ` +
    `Foque nos pontos mais cobrados em provas de residência médica.`;

  // generate-deck expects textContent/cardFormats/detailLevel (not content/formats/density)
  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent: prompt,
      cardCount: 10,
      detailLevel: 'standard',
      cardFormats: ['cloze', 'qa'],
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

  const cardRows = generatedCards
    .map((card: any) => ({
      deck_id: reinforcementDeckId,
      front_content: card?.front?.trim() || '',
      back_content: (card?.back ?? '').trim(),
      card_type: card?.type === 'cloze' ? 'cloze' : 'basic',
    }))
    .filter((card: any) => card.front_content.length > 0);

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
