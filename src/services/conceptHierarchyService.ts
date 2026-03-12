/**
 * conceptHierarchyService — Concept-graph-based diagnostic for the Error Notebook.
 * Traverses global_concepts.parent_concept_id (prerequisite graph) to find weak foundations.
 * Generates cards + questions to fill knowledge gaps in the concept tree.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ConceptNode {
  id: string;
  name: string;
  slug: string;
  state: number;
  stability: number;
  difficulty: number;
  correct_count: number;
  wrong_count: number;
  parent_concept_id: string | null;
  /** Whether this concept is directly linked to the error */
  isErrorSource: boolean;
  /** FSRS health: 'weak' | 'learning' | 'strong' */
  health: 'weak' | 'learning' | 'strong';
  /** Questions linked */
  questionCount: number;
  /** Depth in the prerequisite tree (0 = root, higher = more advanced) */
  depth: number;
}

export interface HierarchyDiagnostic {
  /** The error question that triggered the analysis */
  errorQuestionId: string;
  errorQuestionText: string;
  /** Source concepts (directly linked to the error) */
  sourceConcepts: ConceptNode[];
  /** Foundational concepts found via parent_concept_id with weak FSRS */
  weakFoundations: ConceptNode[];
  /** All concepts in the prerequisite tree */
  allConcepts: ConceptNode[];
  /** Prerequisite path (root ancestors → error concept) */
  conceptPath: { id: string; name: string }[];
}

function getHealth(state: number, stability: number): 'weak' | 'learning' | 'strong' {
  if (state === 0 || state === 3) return 'weak';
  if (state === 1 || stability < 5) return 'learning';
  return 'strong';
}

/**
 * Walk up parent_concept_id to find all ancestor concepts.
 */
async function getConceptAncestors(
  conceptId: string,
  userId: string,
  maxDepth = 10,
): Promise<any[]> {
  const ancestors: any[] = [];
  let currentId: string | null = conceptId;
  const visited = new Set<string>();
  let depth = 0;

  while (currentId && !visited.has(currentId) && depth < maxDepth) {
    visited.add(currentId);
    const { data } = await supabase
      .from('global_concepts' as any)
      .select('*')
      .eq('id', currentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) break;
    const row = data as any;
    if (row.id !== conceptId) {
      ancestors.unshift(row); // prepend so index 0 = root
    }
    currentId = row.parent_concept_id;
    depth++;
  }

  return ancestors;
}

/**
 * Walk down parent_concept_id to find all descendant concepts (children).
 */
async function getConceptDescendants(
  conceptId: string,
  userId: string,
): Promise<any[]> {
  const { data: children } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .eq('parent_concept_id', conceptId);

  if (!children || children.length === 0) return [];

  const descendants = [...(children as any[])];
  for (const child of children as any[]) {
    const deeper = await getConceptDescendants(child.id, userId);
    descendants.push(...deeper);
  }
  return descendants;
}

/**
 * Get siblings (same parent_concept_id, different id).
 */
async function getConceptSiblings(
  conceptId: string,
  parentConceptId: string | null,
  userId: string,
): Promise<any[]> {
  if (!parentConceptId) return [];
  const { data } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .eq('parent_concept_id', parentConceptId)
    .neq('id', conceptId);
  return (data ?? []) as any[];
}

/**
 * Build a concept-graph-based hierarchical diagnostic for an error question.
 * Navigates global_concepts.parent_concept_id instead of decks.parent_deck_id.
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
  if (sourceConceptIds.length === 0) return null;

  // 3. Fetch source concepts
  const { data: sourceConcepts } = await supabase
    .from('global_concepts' as any)
    .select('*')
    .eq('user_id', userId)
    .in('id', sourceConceptIds);

  if (!sourceConcepts || sourceConcepts.length === 0) return null;

  // 4. For each source concept, walk up ancestors + down descendants + siblings
  const allRelatedMap = new Map<string, any>();
  for (const sc of sourceConcepts as any[]) {
    allRelatedMap.set(sc.id, sc);

    const ancestors = await getConceptAncestors(sc.id, userId);
    for (const a of ancestors) allRelatedMap.set(a.id, a);

    const descendants = await getConceptDescendants(sc.id, userId);
    for (const d of descendants) allRelatedMap.set(d.id, d);

    const siblings = await getConceptSiblings(sc.id, sc.parent_concept_id, userId);
    for (const s of siblings) allRelatedMap.set(s.id, s);
  }

  // 5. Get question counts per concept
  const allConceptIds = Array.from(allRelatedMap.keys());
  const questionCountMap = new Map<string, number>();
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

  // 6. Build concept path for the first source concept
  const firstSource = (sourceConcepts as any[])[0];
  const pathAncestors = await getConceptAncestors(firstSource.id, userId);
  const conceptPath = [
    ...pathAncestors.map((a: any) => ({ id: a.id, name: a.name })),
    { id: firstSource.id, name: firstSource.name },
  ];

  // 7. Compute depth for each concept (distance from root)
  function computeDepth(conceptId: string): number {
    let depth = 0;
    let cur = allRelatedMap.get(conceptId);
    const visited = new Set<string>();
    while (cur?.parent_concept_id && !visited.has(cur.id)) {
      visited.add(cur.id);
      depth++;
      cur = allRelatedMap.get(cur.parent_concept_id);
    }
    return depth;
  }

  // 8. Build ConceptNode array
  const allConcepts: ConceptNode[] = Array.from(allRelatedMap.values()).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    state: c.state,
    stability: c.stability,
    difficulty: c.difficulty,
    correct_count: c.correct_count,
    wrong_count: c.wrong_count,
    parent_concept_id: c.parent_concept_id,
    isErrorSource: sourceConceptIds.includes(c.id),
    health: getHealth(c.state, c.stability),
    questionCount: questionCountMap.get(c.id) ?? 0,
    depth: computeDepth(c.id),
  }));

  // 9. Sort: error source first, then weak, then by depth (shallower = more foundational)
  allConcepts.sort((a, b) => {
    if (a.isErrorSource !== b.isErrorSource) return a.isErrorSource ? -1 : 1;
    const healthOrder = { weak: 0, learning: 1, strong: 2 };
    if (healthOrder[a.health] !== healthOrder[b.health]) return healthOrder[a.health] - healthOrder[b.health];
    return a.depth - b.depth; // shallower = more foundational = first
  });

  const sourceNodes = allConcepts.filter(c => c.isErrorSource);
  const weakFoundations = allConcepts.filter(c => !c.isErrorSource && c.health !== 'strong');

  return {
    errorQuestionId,
    errorQuestionText: q.question_text,
    sourceConcepts: sourceNodes,
    weakFoundations,
    allConcepts,
    conceptPath,
  };
}

/**
 * Generate cascade content (cards + questions) for a weak foundational concept.
 */
export async function generateCascadeContent(
  weakConceptId: string,
  weakConceptName: string,
  originErrorText: string,
  userId: string,
): Promise<{ cardsCreated: number; questionsCreated: number; deckId: string } | null> {
  // 1. Get cards related to this concept via question links
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
O aluno errou uma questão avançada. A análise hierárquica identificou que o conceito "${weakConceptName}" é uma lacuna fundacional (pré-requisito).
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

  // 5. Create/reuse "Reforço: {name}" deck
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
