import { supabase } from '@/integrations/supabase/client';

export interface ConceptRow {
  id: string;
  deck_id: string;
  user_id: string;
  name: string;
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
  learning_step: number;
  last_reviewed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  card_count?: number;
}

export interface ConceptCardRow {
  id: string;
  concept_id: string;
  card_id: string;
  created_at: string;
}

// ─── Internal helpers ────────────────────────────
const normalizeConceptName = (value: string) => value.trim().replace(/\s+/g, ' ');

export async function syncConceptsFromQuestions(deckId: string, userId: string) {
  const { data: questionRows, error: questionError } = await supabase
    .from('deck_questions' as any)
    .select('concepts')
    .eq('deck_id', deckId);

  if (questionError) throw questionError;

  const conceptsFromQuestions = new Map<string, string>();
  for (const row of (questionRows ?? []) as any[]) {
    const concepts = Array.isArray(row.concepts) ? row.concepts : [];
    for (const rawConcept of concepts) {
      if (typeof rawConcept !== 'string') continue;
      const normalized = normalizeConceptName(rawConcept);
      if (!normalized) continue;
      const key = normalized.toLocaleLowerCase('pt-BR');
      if (!conceptsFromQuestions.has(key)) conceptsFromQuestions.set(key, normalized);
    }
  }

  if (conceptsFromQuestions.size === 0) return;

  const { data: existingRows, error: existingError } = await supabase
    .from('deck_concepts' as any)
    .select('name, sort_order')
    .eq('deck_id', deckId)
    .eq('user_id', userId);

  if (existingError) throw existingError;

  const existingConceptKeys = new Set(
    ((existingRows ?? []) as any[])
      .map((row: any) => normalizeConceptName(row.name || ''))
      .filter(Boolean)
      .map((name: string) => name.toLocaleLowerCase('pt-BR')),
  );

  const nextSortOrder = ((existingRows ?? []) as any[]).reduce(
    (max, row: any) => Math.max(max, Number(row.sort_order) || 0),
    -1,
  ) + 1;

  const missingConcepts = Array.from(conceptsFromQuestions.entries())
    .filter(([key]) => !existingConceptKeys.has(key))
    .map(([, name]) => name);

  if (missingConcepts.length === 0) return;

  const rowsToInsert = missingConcepts.map((name, index) => ({
    deck_id: deckId,
    user_id: userId,
    name,
    sort_order: nextSortOrder + index,
  }));

  const { error: insertError } = await supabase
    .from('deck_concepts' as any)
    .upsert(rowsToInsert as any, { onConflict: 'deck_id,user_id,name', ignoreDuplicates: true });

  if (insertError) throw insertError;
}

// ─── Fetch concepts for a deck ────────────────────
export async function fetchConcepts(deckId: string, userId: string): Promise<ConceptRow[]> {
  await syncConceptsFromQuestions(deckId, userId);

  const { data: concepts, error } = await supabase
    .from('deck_concepts' as any)
    .select('*')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!concepts || concepts.length === 0) return [];

  // Get card counts per concept
  const conceptIds = (concepts as any[]).map((c: any) => c.id);
  const { data: links } = await supabase
    .from('concept_cards' as any)
    .select('concept_id')
    .in('concept_id', conceptIds);

  const countMap = new Map<string, number>();
  for (const link of (links ?? []) as any[]) {
    countMap.set(link.concept_id, (countMap.get(link.concept_id) ?? 0) + 1);
  }

  return (concepts as any[]).map((c: any) => ({
    ...c,
    card_count: countMap.get(c.id) ?? 0,
  })) as ConceptRow[];
}

// ─── Fetch cards linked to a concept ─────────────
export async function fetchConceptCards(conceptId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('concept_cards' as any)
    .select('card_id')
    .eq('concept_id', conceptId);

  if (error) throw error;
  return ((data ?? []) as any[]).map((r: any) => r.card_id);
}

// ─── Create concept ──────────────────────────────
export async function createConcept(
  deckId: string,
  userId: string,
  name: string,
  cardIds: string[] = [],
): Promise<ConceptRow> {
  const { data, error } = await supabase
    .from('deck_concepts' as any)
    .insert({ deck_id: deckId, user_id: userId, name } as any)
    .select()
    .single();

  if (error) throw error;

  if (cardIds.length > 0) {
    const links = cardIds.map((cardId) => ({
      concept_id: (data as any).id,
      card_id: cardId,
    }));
    await supabase.from('concept_cards' as any).insert(links as any);
  }

  return { ...(data as any), card_count: cardIds.length } as ConceptRow;
}

// ─── Rename concept ─────────────────────────────
export async function renameConcept(conceptId: string, newName: string) {
  const { error } = await supabase
    .from('deck_concepts' as any)
    .update({ name: newName, updated_at: new Date().toISOString() } as any)
    .eq('id', conceptId);
  if (error) throw error;
}

// ─── Delete concept ─────────────────────────────
export async function deleteConcept(conceptId: string) {
  const { error } = await supabase
    .from('deck_concepts' as any)
    .delete()
    .eq('id', conceptId);
  if (error) throw error;
}

// ─── Update concept cards (set full list) ───────
export async function updateConceptCards(conceptId: string, cardIds: string[]) {
  // Remove all existing links
  await supabase.from('concept_cards' as any).delete().eq('concept_id', conceptId);

  // Insert new links
  if (cardIds.length > 0) {
    const links = cardIds.map((cardId) => ({ concept_id: conceptId, card_id: cardId }));
    const { error } = await supabase.from('concept_cards' as any).insert(links as any);
    if (error) throw error;
  }
}

// ─── Update concept FSRS fields (after study) ───
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
    .from('deck_concepts' as any)
    .update({ ...fields, updated_at: new Date().toISOString() } as any)
    .eq('id', conceptId);
  if (error) throw error;
}
