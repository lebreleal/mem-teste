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
