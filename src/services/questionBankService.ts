/**
 * questionBankService — Fetches questions from 3 sources (my, official, community)
 * and imports them to user decks with auto-hierarchy + concept linking.
 */
import { supabase } from '@/integrations/supabase/client';
import { linkQuestionsToConcepts, CATEGORY_SUBCATEGORIES } from './globalConceptService';

export interface BankQuestion {
  id: string;
  deck_id: string;
  question_text: string;
  options: any;
  correct_indices: number[] | null;
  explanation: string;
  concepts: string[];
  question_type: string;
  deck_name: string;
  turma_name: string | null;
  category: string | null;
  subcategory: string | null;
  correct_answer: string;
  created_at: string;
}

export type QuestionSource = 'my' | 'official' | 'community';

export interface QuestionFilters {
  search?: string;
  category?: string;
  subcategory?: string;
  conceptName?: string;
  questionType?: string;
  hasExplanation?: boolean;
}

// ─── Helper: batch .in() queries ───
async function batchedInFetch<T>(
  table: string,
  column: string,
  ids: string[],
  selectCols: string,
  batchSize = 300,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { data } = await supabase
      .from(table as any)
      .select(selectCols)
      .in(column, batch);
    if (data) results.push(...(data as any[]));
  }
  return results;
}

// ─── Fetch user's own questions ───
export async function fetchMyQuestions(userId: string): Promise<BankQuestion[]> {
  // Get user's decks
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_archived', false);

  if (!decks || decks.length === 0) return [];

  const deckIds = decks.map(d => d.id);
  const deckNameMap = new Map(decks.map(d => [d.id, d.name]));

  // Fetch questions in batches
  const questions = await batchedInFetch<any>(
    'deck_questions', 'deck_id', deckIds,
    'id, deck_id, question_text, options, correct_indices, explanation, concepts, question_type, correct_answer, created_at',
  );

  if (questions.length === 0) return [];

  // Enrich with concept categories
  const categoryMap = await getQuestionCategoryMap(questions.map(q => q.id));

  return questions.map(q => ({
    id: q.id,
    deck_id: q.deck_id,
    question_text: q.question_text,
    options: q.options ?? [],
    correct_indices: q.correct_indices,
    explanation: q.explanation ?? '',
    concepts: Array.isArray(q.concepts) ? q.concepts : [],
    question_type: q.question_type,
    correct_answer: q.correct_answer ?? '',
    deck_name: deckNameMap.get(q.deck_id) ?? 'Baralho',
    turma_name: null,
    category: categoryMap.get(q.id)?.category ?? null,
    subcategory: categoryMap.get(q.id)?.subcategory ?? null,
    created_at: q.created_at,
  }));
}

// ─── Fetch public questions from community/official turma decks ───
export async function fetchPublicQuestions(type: QuestionSource): Promise<BankQuestion[]> {
  // Get published turma_decks with their turmas
  const { data: turmaDecks } = await supabase
    .from('turma_decks')
    .select('deck_id, turma_id, turmas!inner(name, is_private)')
    .eq('is_published', true);

  if (!turmaDecks || turmaDecks.length === 0) return [];

  // Filter public turmas
  const publicTd = (turmaDecks as any[]).filter(td => !td.turmas?.is_private);
  if (publicTd.length === 0) return [];

  const deckIds = publicTd.map(td => td.deck_id);
  const turmaByDeck = new Map(publicTd.map(td => [td.deck_id, td.turmas?.name ?? 'Comunidade']));

  // Fetch deck names in batches
  const decks = await batchedInFetch<any>('decks', 'id', deckIds, 'id, name');
  const deckNameMap = new Map(decks.map((d: any) => [d.id, d.name]));

  // Fetch questions in batches
  const questions = await batchedInFetch<any>(
    'deck_questions', 'deck_id', deckIds,
    'id, deck_id, question_text, options, correct_indices, explanation, concepts, question_type, correct_answer, created_at',
  );

  if (questions.length === 0) return [];

  // Enrich with concept categories
  const categoryMap = await getQuestionCategoryMap(questions.map(q => q.id));

  return questions.map(q => ({
    id: q.id,
    deck_id: q.deck_id,
    question_text: q.question_text,
    options: q.options ?? [],
    correct_indices: q.correct_indices,
    explanation: q.explanation ?? '',
    concepts: Array.isArray(q.concepts) ? q.concepts : [],
    question_type: q.question_type,
    correct_answer: q.correct_answer ?? '',
    deck_name: deckNameMap.get(q.deck_id) ?? 'Baralho',
    turma_name: turmaByDeck.get(q.deck_id) ?? null,
    category: categoryMap.get(q.id)?.category ?? null,
    subcategory: categoryMap.get(q.id)?.subcategory ?? null,
    created_at: q.created_at ?? '',
  }));
}

// ─── Helper: get category/subcategory for questions via question_concepts ───
async function getQuestionCategoryMap(
  questionIds: string[],
): Promise<Map<string, { category: string; subcategory: string | null }>> {
  const result = new Map<string, { category: string; subcategory: string | null }>();
  if (questionIds.length === 0) return result;

  const links = await batchedInFetch<any>(
    'question_concepts', 'question_id', questionIds, 'question_id, concept_id',
  );

  if (links.length === 0) return result;

  const conceptIds = [...new Set(links.map(l => l.concept_id))];
  const concepts = await batchedInFetch<any>(
    'global_concepts', 'id', conceptIds, 'id, category, subcategory',
  );

  const conceptMap = new Map(concepts.map(c => [c.id, { category: c.category, subcategory: c.subcategory }]));

  for (const link of links) {
    if (result.has(link.question_id)) continue;
    const c = conceptMap.get(link.concept_id);
    if (c?.category) {
      result.set(link.question_id, { category: c.category, subcategory: c.subcategory });
    }
  }

  return result;
}

// ─── Client-side filtering ───
export function filterQuestions(questions: BankQuestion[], filters: QuestionFilters): BankQuestion[] {
  let list = questions;

  if (filters.category && filters.category !== '__all__') {
    list = list.filter(q => q.category === filters.category);
  }

  if (filters.subcategory && filters.subcategory !== '__all__') {
    list = list.filter(q => q.subcategory === filters.subcategory);
  }

  if (filters.questionType && filters.questionType !== '__all__') {
    list = list.filter(q => q.question_type === filters.questionType);
  }

  if (filters.hasExplanation) {
    list = list.filter(q => q.explanation && q.explanation.trim().length > 10);
  }

  if (filters.conceptName) {
    const lower = filters.conceptName.toLowerCase();
    list = list.filter(q => q.concepts.some(c => c.toLowerCase().includes(lower)));
  }

  if (filters.search?.trim()) {
    const lower = filters.search.toLowerCase();
    list = list.filter(q =>
      q.question_text.toLowerCase().includes(lower) ||
      q.concepts.some(c => c.toLowerCase().includes(lower)) ||
      q.deck_name.toLowerCase().includes(lower) ||
      (q.explanation ?? '').toLowerCase().includes(lower)
    );
  }

  return list;
}

// ─── Get stats from a question list ───
export function getQuestionStats(questions: BankQuestion[]) {
  const categories = new Map<string, number>();
  const subcategories = new Map<string, number>();
  const conceptFrequency = new Map<string, number>();
  const types = new Map<string, number>();

  for (const q of questions) {
    if (q.category) categories.set(q.category, (categories.get(q.category) ?? 0) + 1);
    if (q.subcategory) subcategories.set(q.subcategory, (subcategories.get(q.subcategory) ?? 0) + 1);
    types.set(q.question_type, (types.get(q.question_type) ?? 0) + 1);
    for (const c of q.concepts) {
      conceptFrequency.set(c, (conceptFrequency.get(c) ?? 0) + 1);
    }
  }

  // Sort concepts by frequency (most used first)
  const topConcepts = Array.from(conceptFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  return {
    categories: Array.from(categories.entries()).sort((a, b) => b[1] - a[1]),
    subcategories: Array.from(subcategories.entries()).sort((a, b) => b[1] - a[1]),
    topConcepts,
    types: Array.from(types.entries()),
    total: questions.length,
    withExplanation: questions.filter(q => q.explanation && q.explanation.trim().length > 10).length,
  };
}

// ─── Import selected questions into user's decks with auto-hierarchy ───
export async function importQuestionsToDecks(
  userId: string,
  questions: BankQuestion[],
): Promise<{ deckCount: number; questionCount: number; cardCount: number }> {
  // Group by category > subcategory for hierarchical deck creation
  const groups = new Map<string, BankQuestion[]>();
  for (const q of questions) {
    const key = q.category
      ? `${q.deck_name} › ${q.category}${q.subcategory ? ` › ${q.subcategory}` : ''}`
      : q.deck_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }

  let totalDecks = 0;
  let totalQuestions = 0;
  let totalCards = 0;

  for (const [deckName, qs] of groups) {
    // Create or find deck
    const { data: existingDeck } = await supabase
      .from('decks')
      .select('id')
      .eq('user_id', userId)
      .eq('name', deckName)
      .maybeSingle();

    let deckId: string;
    if (existingDeck) {
      deckId = existingDeck.id;
    } else {
      const { data: newDeck, error } = await supabase
        .from('decks')
        .insert({ name: deckName, user_id: userId } as any)
        .select('id')
        .single();
      if (error || !newDeck) continue;
      deckId = newDeck.id;
      totalDecks++;
    }

    // Insert questions
    const questionRows = qs.map((q, i) => ({
      deck_id: deckId,
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

    const { data: inserted } = await supabase
      .from('deck_questions' as any)
      .insert(questionRows as any)
      .select('id, concepts');

    if (inserted) {
      totalQuestions += inserted.length;

      // Link concepts
      const pairs = (inserted as any[])
        .filter(q => q.concepts?.length > 0)
        .map(q => ({
          questionId: q.id,
          conceptNames: q.concepts,
          category: qs.find(oq => oq.question_text === q.question_text)?.category ?? undefined,
          subcategory: qs.find(oq => oq.question_text === q.question_text)?.subcategory ?? undefined,
        }));

      if (pairs.length > 0) {
        await linkQuestionsToConcepts(userId, pairs);
      }

      // Create basic review cards
      const conceptNames = new Set<string>();
      for (const q of qs) {
        for (const c of q.concepts) conceptNames.add(c);
      }

      if (conceptNames.size > 0) {
        const cardRows = Array.from(conceptNames).map(name => ({
          deck_id: deckId,
          front_content: `<p>Explique o conceito: <strong>${name}</strong></p>`,
          back_content: `<p>Conceito importado do banco de questões. Revise as questões vinculadas para aprofundamento.</p>`,
          card_type: 'basic',
        }));

        const { data: insertedCards } = await supabase
          .from('cards')
          .insert(cardRows as any)
          .select('id');

        totalCards += insertedCards?.length ?? 0;
      }
    }
  }

  return { deckCount: totalDecks, questionCount: totalQuestions, cardCount: totalCards };
}
