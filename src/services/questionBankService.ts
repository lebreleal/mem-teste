/**
 * questionBankService — Fetches public questions and imports them to user decks.
 */
import { supabase } from '@/integrations/supabase/client';
import { linkQuestionsToConcepts } from './globalConceptService';

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
}

/** Fetch public questions from community decks */
export async function fetchPublicQuestions(type: 'official' | 'community'): Promise<BankQuestion[]> {
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

  // Fetch deck names
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name')
    .in('id', deckIds);

  const deckNameMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));

  // Fetch questions from these decks
  const { data: questions } = await supabase
    .from('deck_questions' as any)
    .select('id, deck_id, question_text, options, correct_indices, explanation, concepts, question_type')
    .in('deck_id', deckIds)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!questions) return [];

  // Get concepts/categories from global_concepts via question_concepts
  const qIds = (questions as any[]).map(q => q.id);
  const { data: conceptLinks } = await supabase
    .from('question_concepts' as any)
    .select('question_id, concept_id')
    .in('question_id', qIds);

  const conceptIds = [...new Set((conceptLinks ?? []).map((l: any) => l.concept_id))];
  let conceptCategoryMap = new Map<string, string>();
  if (conceptIds.length > 0) {
    const { data: gc } = await supabase
      .from('global_concepts' as any)
      .select('id, category')
      .in('id', conceptIds);
    if (gc) {
      for (const c of gc as any[]) {
        if (c.category) conceptCategoryMap.set(c.id, c.category);
      }
    }
  }

  // Map question → category from linked concepts
  const qCategoryMap = new Map<string, string>();
  for (const link of (conceptLinks ?? []) as any[]) {
    const cat = conceptCategoryMap.get(link.concept_id);
    if (cat && !qCategoryMap.has(link.question_id)) {
      qCategoryMap.set(link.question_id, cat);
    }
  }

  return (questions as any[]).map(q => ({
    id: q.id,
    deck_id: q.deck_id,
    question_text: q.question_text,
    options: q.options ?? [],
    correct_indices: q.correct_indices,
    explanation: q.explanation ?? '',
    concepts: Array.isArray(q.concepts) ? q.concepts : [],
    question_type: q.question_type,
    deck_name: deckNameMap.get(q.deck_id) ?? 'Baralho',
    turma_name: turmaByDeck.get(q.deck_id) ?? null,
    category: qCategoryMap.get(q.id) ?? null,
  }));
}

/** Import selected questions into user's decks with auto-hierarchy */
export async function importQuestionsToDecks(
  userId: string,
  questions: BankQuestion[],
): Promise<{ deckCount: number; questionCount: number; cardCount: number }> {
  // Group by source deck name
  const groups = new Map<string, BankQuestion[]>();
  for (const q of questions) {
    const key = q.deck_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }

  let totalDecks = 0;
  let totalQuestions = 0;
  let totalCards = 0;

  for (const [deckName, qs] of groups) {
    // Create or find deck with this name
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
        }));

      if (pairs.length > 0) {
        await linkQuestionsToConcepts(userId, pairs);
      }

      // Create basic cards for each concept
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
