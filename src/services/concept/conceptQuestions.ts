/**
 * conceptQuestions — Question linking, retrieval, generation for global concepts.
 * Extracted from globalConceptService.ts (copy-paste integral).
 */
import { supabase } from '@/integrations/supabase/client';
import { GLOBAL_CONCEPT_COLS, type GlobalConcept, conceptSlug, ensureGlobalConcepts } from './conceptCrud';
import { mapPrerequisitesViaAI } from './conceptHierarchy';

// ─── Auto-trigger prerequisite mapping (non-blocking) ───
const _autoMapInFlight = new Set<string>();
async function tryAutoMapPrerequisites(userId: string, newConceptSlugs?: string[]) {
  if (_autoMapInFlight.has(userId)) return;
  _autoMapInFlight.add(userId);
  try {
    // If we have new concepts, always try to map them
    if (newConceptSlugs && newConceptSlugs.length > 0) {
      await mapPrerequisitesViaAI(userId);
      return;
    }

    // Fallback: check if there are enough unmapped concepts
    const { data: unmapped } = await supabase
      .from('global_concepts' as any)
      .select('id')
      .eq('user_id', userId)
      .is('parent_concept_id', null);

    if (!unmapped || unmapped.length < 3) return;
    await mapPrerequisitesViaAI(userId);
  } finally {
    _autoMapInFlight.delete(userId);
  }
}

// ─── Link questions to global concepts (with prerequisite support) ──────────
export type LinkQuestionsToConceptsOptions = {
  /** Also links prerequisite concepts to the same questions to avoid orphan concepts */
  linkPrerequisitesToQuestion?: boolean;
  /** Links every concept in the batch to every question in the same batch */
  denseBatchLinking?: boolean;
};

export async function linkQuestionsToConcepts(
  userId: string,
  questionConceptPairs: { questionId: string; conceptNames: string[]; prerequisites?: string[]; category?: string; subcategory?: string; conceptDescriptions?: { name: string; description: string }[] }[],
  options?: LinkQuestionsToConceptsOptions,
) {
  const linkPrerequisitesToQuestion = options?.linkPrerequisitesToQuestion ?? true;
  const denseBatchLinking = options?.denseBatchLinking ?? false;

  // Collect all unique concept names + meta (concepts + prerequisites)
  const allNames = new Set<string>();
  const metaMap = new Map<string, { category?: string; subcategory?: string }>();
  const prerequisiteMap = new Map<string, string[]>(); // conceptSlug → prerequisiteNames[]
  const questionSlugMap = new Map<string, Set<string>>(); // questionId → concept slugs linked to that question

  for (const pair of questionConceptPairs) {
    const questionSlugs = questionSlugMap.get(pair.questionId) ?? new Set<string>();

    const conceptNames = (pair.conceptNames ?? [])
      .map(name => name?.trim())
      .filter((name): name is string => !!name);

    const prerequisiteNames = Array.from(new Set((pair.prerequisites ?? [])
      .map(name => name?.trim())
      .filter((name): name is string => !!name)));

    for (const name of conceptNames) {
      allNames.add(name);
      const slug = conceptSlug(name);
      questionSlugs.add(slug);

      if (pair.category && !metaMap.has(slug)) {
        metaMap.set(slug, { category: pair.category, subcategory: pair.subcategory });
      }

      if (prerequisiteNames.length > 0) {
        const existing = prerequisiteMap.get(slug) ?? [];
        prerequisiteMap.set(slug, [...existing, ...prerequisiteNames]);
      }
    }

    for (const prereq of prerequisiteNames) {
      allNames.add(prereq);
      if (linkPrerequisitesToQuestion) {
        questionSlugs.add(conceptSlug(prereq));
      }
    }

    questionSlugMap.set(pair.questionId, questionSlugs);
  }

  const uniqueNames = Array.from(allNames);

  // Build context description map: questionId+conceptSlug → context_description
  const contextDescMap = new Map<string, string>(); // "questionId:slug" → description
  for (const pair of questionConceptPairs) {
    if (pair.conceptDescriptions) {
      for (const cd of pair.conceptDescriptions) {
        if (cd.name && cd.description) {
          contextDescMap.set(`${pair.questionId}:${conceptSlug(cd.name)}`, cd.description);
        }
      }
    }
  }

  const slugToId = await ensureGlobalConcepts(userId, uniqueNames, metaMap);

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

  // Build junction rows with context_description (deduplicated)
  const rows: { question_id: string; concept_id: string; context_description?: string }[] = [];
  const rowKeys = new Set<string>();
  const addRow = (questionId: string, conceptId: string, slug?: string) => {
    const key = `${questionId}:${conceptId}`;
    if (rowKeys.has(key)) return;
    rowKeys.add(key);
    const ctxDesc = slug ? contextDescMap.get(`${questionId}:${slug}`) : undefined;
    rows.push({ question_id: questionId, concept_id: conceptId, ...(ctxDesc ? { context_description: ctxDesc } : {}) });
  };

  for (const [questionId, slugs] of questionSlugMap.entries()) {
    for (const slug of slugs) {
      const conceptId = slugToId.get(slug);
      if (conceptId) addRow(questionId, conceptId, slug);
    }
  }

  if (denseBatchLinking && questionSlugMap.size > 1) {
    const allConceptIds = new Set<string>();
    for (const slugs of questionSlugMap.values()) {
      for (const slug of slugs) {
        const conceptId = slugToId.get(slug);
        if (conceptId) allConceptIds.add(conceptId);
      }
    }

    for (const questionId of questionSlugMap.keys()) {
      for (const conceptId of allConceptIds) {
        addRow(questionId, conceptId);
      }
    }
  }

  if (rows.length === 0) return;

  // Upsert to avoid duplicates — update context_description if it changes
  await supabase
    .from('question_concepts' as any)
    .upsert(rows as any, { onConflict: 'question_id,concept_id', ignoreDuplicates: false });

  // ── Auto-trigger prerequisite mapping for newly created concepts ──
  const newSlugs = uniqueNames.map(n => conceptSlug(n));
  tryAutoMapPrerequisites(userId, newSlugs).catch(() => {});
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

  // Pick randomly among the top candidates (unanswered or same oldest date)
  const topDate = lastAnswered.get(sorted[0]);
  const topCandidates = sorted.filter(id => {
    const d = lastAnswered.get(id);
    if (!topDate && !d) return true;
    return d === topDate;
  });
  const bestId = topCandidates[Math.floor(Math.random() * topCandidates.length)];

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

// ─── Get concepts linked to a specific card ────
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
    .select(GLOBAL_CONCEPT_COLS)
    .eq('user_id', userId)
    .in('id', conceptIds)
    .order('stability', { ascending: true });

  return (concepts ?? []) as unknown as GlobalConcept[];
}

// ─── Get cards related to a concept across ALL user decks ───
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
    throw deleteError;
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
    return null;
  }

  if (data?.error) {
    return null;
  }

  return data;
}

// ─── Auto-generate questions for a concept that has none ───
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
