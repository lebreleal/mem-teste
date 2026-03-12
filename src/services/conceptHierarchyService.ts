/**
 * conceptHierarchyService — Hierarchical concept analysis for the Error Notebook.
 * Traverses deck hierarchy to find weak foundational concepts related to errors.
 * Generates cards + questions to fill knowledge gaps in the hierarchy.
 */
import { supabase } from '@/integrations/supabase/client';
import type { GlobalConcept } from './globalConceptService';

export interface ConceptNode {
  id: string;
  name: string;
  slug: string;
  state: number;
  stability: number;
  difficulty: number;
  correct_count: number;
  wrong_count: number;
  deckId: string;
  deckName: string;
  /** Whether this concept is directly linked to the error */
  isErrorSource: boolean;
  /** FSRS health: 'weak' | 'learning' | 'strong' */
  health: 'weak' | 'learning' | 'strong';
  /** Related cards count */
  cardCount: number;
  /** Questions linked */
  questionCount: number;
}

export interface HierarchyDiagnostic {
  /** The error question that triggered the analysis */
  errorQuestionId: string;
  errorQuestionText: string;
  /** Source concept (the one directly linked to the error) */
  sourceConcept: ConceptNode | null;
  /** Foundational concepts found in parent/sibling decks with weak FSRS */
  weakFoundations: ConceptNode[];
  /** All concepts in the hierarchy tree */
  allConcepts: ConceptNode[];
  /** Deck hierarchy path (root → current) */
  deckPath: { id: string; name: string }[];
}

function getHealth(state: number, stability: number): 'weak' | 'learning' | 'strong' {
  if (state === 0 || state === 3) return 'weak';
  if (state === 1 || stability < 5) return 'learning';
  return 'strong';
}

/**
 * Get all ancestor deck IDs (walking up parent_deck_id).
 */
async function getAncestorDeckIds(deckId: string): Promise<{ id: string; name: string }[]> {
  const path: { id: string; name: string }[] = [];
  let currentId: string | null = deckId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const { data } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id')
      .eq('id', currentId)
      .maybeSingle();

    if (!data) break;
    path.unshift({ id: data.id, name: data.name });
    currentId = data.parent_deck_id;
  }

  return path;
}

/**
 * Get all descendant deck IDs (walking down parent_deck_id).
 */
async function getDescendantDeckIds(deckId: string, userId: string): Promise<string[]> {
  const { data: children } = await supabase
    .from('decks')
    .select('id')
    .eq('parent_deck_id', deckId)
    .eq('user_id', userId);

  if (!children || children.length === 0) return [];

  const childIds = children.map(c => c.id);
  const deeper: string[] = [];
  for (const cid of childIds) {
    deeper.push(...await getDescendantDeckIds(cid, userId));
  }
  return [...childIds, ...deeper];
}

/**
 * Get sibling deck IDs (same parent_deck_id).
 */
async function getSiblingDeckIds(deckId: string, userId: string): Promise<string[]> {
  const { data: deck } = await supabase
    .from('decks')
    .select('parent_deck_id')
    .eq('id', deckId)
    .maybeSingle();

  if (!deck?.parent_deck_id) return [];

  const { data: siblings } = await supabase
    .from('decks')
    .select('id')
    .eq('parent_deck_id', deck.parent_deck_id)
    .eq('user_id', userId)
    .neq('id', deckId);

  return (siblings ?? []).map(s => s.id);
}

/**
 * Build a full hierarchical diagnostic for an error question.
 * Finds the concept tree: ancestors → current → descendants, identifies weak spots.
 */
export async function buildHierarchyDiagnostic(
  errorQuestionId: string,
  userId: string,
): Promise<HierarchyDiagnostic | null> {
  // 1. Get the error question
  const { data: question } = await supabase
    .from('deck_questions' as any)
    .select('id, deck_id, question_text, concepts')
    .eq('id', errorQuestionId)
    .maybeSingle();

  if (!question) return null;
  const q = question as any;

  // 2. Get concepts linked to this question
  const { data: conceptLinks } = await supabase
    .from('question_concepts' as any)
    .select('concept_id')
    .eq('question_id', errorQuestionId);

  const sourceConceptIds = (conceptLinks ?? []).map((l: any) => l.concept_id);

  // 3. Get deck hierarchy (ancestors + siblings + descendants)
  const deckPath = await getAncestorDeckIds(q.deck_id);
  const ancestorDeckIds = deckPath.map(d => d.id);
  const siblingDeckIds = await getSiblingDeckIds(q.deck_id, userId);
  const descendantDeckIds = await getDescendantDeckIds(q.deck_id, userId);

  const allRelatedDeckIds = [...new Set([...ancestorDeckIds, ...siblingDeckIds, ...descendantDeckIds])];

  // 4. Get all questions from related decks
  const { data: relatedQuestions } = await supabase
    .from('deck_questions' as any)
    .select('id, deck_id')
    .in('deck_id', allRelatedDeckIds);

  const relatedQuestionIds = (relatedQuestions ?? []).map((rq: any) => rq.id);

  // 5. Get all concept links from those questions
  let allConceptIds: string[] = [...sourceConceptIds];
  if (relatedQuestionIds.length > 0) {
    // Batch in chunks of 100 to avoid query limits
    for (let i = 0; i < relatedQuestionIds.length; i += 100) {
      const batch = relatedQuestionIds.slice(i, i + 100);
      const { data: links } = await supabase
        .from('question_concepts' as any)
        .select('concept_id')
        .in('question_id', batch);
      if (links) {
        allConceptIds.push(...(links as any[]).map(l => l.concept_id));
      }
    }
  }

  allConceptIds = [...new Set(allConceptIds)];
  if (allConceptIds.length === 0) return null;

  // 6. Fetch all global concepts
  const { data: concepts } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .in('id', allConceptIds);

  if (!concepts || concepts.length === 0) return null;

  // 7. Get card counts per deck
  const { data: cardCounts } = await supabase
    .from('cards')
    .select('deck_id')
    .in('deck_id', allRelatedDeckIds);

  const cardCountMap = new Map<string, number>();
  for (const c of (cardCounts ?? []) as any[]) {
    cardCountMap.set(c.deck_id, (cardCountMap.get(c.deck_id) ?? 0) + 1);
  }

  // 8. Get question counts per concept
  const questionCountMap = new Map<string, number>();
  if (relatedQuestionIds.length > 0) {
    for (let i = 0; i < allConceptIds.length; i += 50) {
      const batch = allConceptIds.slice(i, i + 50);
      const { data: qcLinks } = await supabase
        .from('question_concepts' as any)
        .select('concept_id')
        .in('concept_id', batch);
      if (qcLinks) {
        for (const l of qcLinks as any[]) {
          questionCountMap.set(l.concept_id, (questionCountMap.get(l.concept_id) ?? 0) + 1);
        }
      }
    }
  }

  // 9. Map concept → deck (via question links)
  const conceptDeckMap = new Map<string, string>();
  for (const rq of (relatedQuestions ?? []) as any[]) {
    const { data: links } = await supabase
      .from('question_concepts' as any)
      .select('concept_id')
      .eq('question_id', rq.id)
      .limit(10);
    if (links) {
      for (const l of links as any[]) {
        if (!conceptDeckMap.has(l.concept_id)) {
          conceptDeckMap.set(l.concept_id, rq.deck_id);
        }
      }
    }
  }

  // 10. Get deck names
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name')
    .in('id', allRelatedDeckIds);
  const deckNameMap = new Map((decks ?? []).map(d => [d.id, d.name]));

  // 11. Build concept nodes
  const allConcepts: ConceptNode[] = (concepts as any[]).map(c => {
    const deckId = conceptDeckMap.get(c.id) ?? q.deck_id;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      state: c.state,
      stability: c.stability,
      difficulty: c.difficulty,
      correct_count: c.correct_count,
      wrong_count: c.wrong_count,
      deckId,
      deckName: deckNameMap.get(deckId) ?? 'Baralho',
      isErrorSource: sourceConceptIds.includes(c.id),
      health: getHealth(c.state, c.stability),
      cardCount: cardCountMap.get(deckId) ?? 0,
      questionCount: questionCountMap.get(c.id) ?? 0,
    };
  });

  // 12. Sort: error source first, then weak, then by stability
  allConcepts.sort((a, b) => {
    if (a.isErrorSource !== b.isErrorSource) return a.isErrorSource ? -1 : 1;
    const healthOrder = { weak: 0, learning: 1, strong: 2 };
    if (healthOrder[a.health] !== healthOrder[b.health]) return healthOrder[a.health] - healthOrder[b.health];
    return a.stability - b.stability;
  });

  const sourceConcept = allConcepts.find(c => c.isErrorSource) ?? null;
  const weakFoundations = allConcepts.filter(c => !c.isErrorSource && c.health !== 'strong');

  return {
    errorQuestionId,
    errorQuestionText: q.question_text,
    sourceConcept,
    weakFoundations,
    allConcepts,
    deckPath,
  };
}

/**
 * Generate cascade content (cards + questions) for a weak foundational concept.
 * Creates didactic cards AND questions to fill the gap.
 */
export async function generateCascadeContent(
  weakConceptId: string,
  weakConceptName: string,
  originErrorText: string,
  userId: string,
): Promise<{ cardsCreated: number; questionsCreated: number; deckId: string } | null> {
  // 1. Get cards related to this concept
  const { data: links } = await supabase
    .from('question_concepts' as any)
    .select('question_id')
    .eq('concept_id', weakConceptId);

  const questionIds = (links ?? []).map((l: any) => l.question_id);

  let deckIds: string[] = [];
  if (questionIds.length > 0) {
    const { data: qs } = await supabase
      .from('deck_questions' as any)
      .select('deck_id')
      .in('id', questionIds);
    deckIds = [...new Set((qs ?? []).map((q: any) => q.deck_id))];
  }

  // 2. Get existing cards from those decks
  let existingCards: { id: string; front_content: string; back_content: string }[] = [];
  if (deckIds.length > 0) {
    const { data: cards } = await supabase
      .from('cards')
      .select('id, front_content, back_content')
      .in('deck_id', deckIds)
      .limit(30);
    existingCards = (cards ?? []) as any[];
  }

  // 3. Build context for AI
  const cardContext = existingCards
    .slice(0, 15)
    .map(c => `P: ${c.front_content.replace(/<[^>]*>/g, '').slice(0, 200)}\nR: ${c.back_content.replace(/<[^>]*>/g, '').slice(0, 200)}`)
    .join('\n---\n');

  const textContent = [
    `LACUNA IDENTIFICADA: O aluno errou uma questão sobre um tema avançado.`,
    `Questão que o aluno errou: ${originErrorText.replace(/<[^>]*>/g, '').slice(0, 400)}`,
    `\nTEMA FUNDACIONAL FRACO: "${weakConceptName}"`,
    `O aluno precisa dominar "${weakConceptName}" para conseguir responder o tema avançado acima.`,
    cardContext ? `\nCARDS EXISTENTES SOBRE O TEMA (use como referência):\n${cardContext}` : '',
  ].filter(Boolean).join('\n\n');

  const customInstructions = `
Você é um especialista em recuperação de aprendizagem médica.

CONTEXTO:
O aluno errou uma questão avançada. A análise hierárquica identificou que o conceito "${weakConceptName}" é uma lacuna fundacional.
Seu objetivo é criar cartões que PREENCHAM essa lacuna para que o aluno consiga responder questões avançadas no futuro.

REGRAS OBRIGATÓRIAS:
- Crie cartões em sequência didática: definição básica → mecanismo → aplicação clínica.
- Cada card deve ser auto-contido e útil isoladamente.
- Use linguagem simples. Se usar termo técnico, explique entre parênteses.
- APENAS type "basic" (qa). Proibido cloze e múltipla escolha.
- Front: pergunta curta e direta (máximo 1 frase).
- Back: resposta em no máximo 3 frases.
- Não invente conteúdo fora do contexto médico fornecido.
`.trim();

  // 4. Generate cards via edge function
  const { data, error } = await supabase.functions.invoke('generate-deck', {
    body: {
      textContent,
      customInstructions,
      cardCount: 5,
      detailLevel: 'essential',
      cardFormats: ['qa'],
      aiModel: 'pro',
      energyCost: 0,
    },
  });

  if (error || data?.error) {
    console.error('generateCascadeContent error:', error ?? data?.error);
    return null;
  }

  const generatedCards = Array.isArray(data?.cards) ? data.cards : [];
  if (generatedCards.length === 0) return null;

  // 5. Create/reuse "Reforço Hierárquico: {name}" deck
  const deckName = `Reforço: ${weakConceptName.slice(0, 60)}`;

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
  } else {
    // Clear old cards to refresh
    await supabase.from('cards').delete().eq('deck_id', deckId);
  }

  // 6. Insert new cards
  const normalize = (v?: string) => (v ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cardRows = generatedCards
    .map((c: any) => ({
      deck_id: deckId,
      front_content: normalize(c?.front),
      back_content: normalize(c?.back),
      card_type: 'basic',
    }))
    .filter((c: any) => c.front_content.length > 0 && c.back_content.length > 0);

  const { data: insertedCards } = await supabase
    .from('cards')
    .insert(cardRows as any)
    .select('id');

  const cardsCreated = insertedCards?.length ?? 0;

  // 7. Generate questions from the new cards
  let questionsCreated = 0;
  if (cardsCreated >= 3) {
    const cardIds = (insertedCards ?? []).map((c: any) => c.id);
    const { data: qData } = await supabase.functions.invoke('generate-questions', {
      body: { cardIds, aiModel: 'flash', energyCost: 0, optionsCount: 4 },
    });

    if (qData?.questions && Array.isArray(qData.questions)) {
      const questionRows = qData.questions.map((q: any, i: number) => ({
        deck_id: deckId,
        created_by: userId,
        question_text: q.question_text,
        options: q.options,
        correct_indices: [q.correct_index ?? 0],
        correct_answer: q.options?.[q.correct_index ?? 0] ?? '',
        explanation: q.explanation ?? '',
        concepts: q.concepts ?? [weakConceptName],
        question_type: 'multiple_choice',
        sort_order: i,
      }));

      const { data: insertedQs } = await supabase
        .from('deck_questions' as any)
        .insert(questionRows as any)
        .select('id');

      questionsCreated = insertedQs?.length ?? 0;

      // Link new questions to the concept
      if (questionsCreated > 0) {
        const junctionRows = (insertedQs as any[]).map(q => ({
          question_id: q.id,
          concept_id: weakConceptId,
        }));
        await supabase
          .from('question_concepts' as any)
          .upsert(junctionRows as any, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });
      }
    }
  }

  return { cardsCreated, questionsCreated, deckId: deckId! };
}
