/**
 * Turma content operations: semesters, subjects, lessons, decks, files, ratings.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { TurmaSemester, TurmaSubject, TurmaLesson, TurmaDeck } from '@/types/turma';

// ── Aggregate counts for ContentTab ──

/** Count how many user decks reference each turma_deck (downloads/inscrições). */
export async function countTurmaDeckDownloads(turmaDeckIds: string[]): Promise<Record<string, number>> {
  if (turmaDeckIds.length === 0) return {};
  const { data } = await supabase
    .from('decks')
    .select('source_turma_deck_id')
    .in('source_turma_deck_id', turmaDeckIds);
  const counts: Record<string, number> = {};
  (data ?? []).forEach(d => {
    const key = d.source_turma_deck_id;
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

/** Count files per lesson_id in a turma. */
export async function countTurmaFilesByLesson(turmaId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('turma_lesson_files')
    .select('lesson_id')
    .eq('turma_id', turmaId);
  const counts: Record<string, number> = {};
  (data ?? []).forEach(f => {
    const key = f.lesson_id;
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

/** Count published exams per lesson_id in a turma. */
export async function countTurmaExamsByLesson(turmaId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('turma_exams')
    .select('lesson_id')
    .eq('turma_id', turmaId)
    .eq('is_published', true);
  const counts: Record<string, number> = {};
  (data ?? []).forEach(e => {
    if (e.lesson_id) counts[e.lesson_id] = (counts[e.lesson_id] || 0) + 1;
  });
  return counts;
}

/** Invoke detect-import-format edge function. */
export async function invokeDetectImportFormat(sample: string) {
  const { data, error } = await supabase.functions.invoke('detect-import-format', {
    body: { sample },
  });
  if (error) throw error;
  return data;
}

// ── Hierarchy Queries ──

export async function fetchTurmaSemesters(turmaId: string): Promise<TurmaSemester[]> {
  const { data } = await supabase.from('turma_semesters').select('id, turma_id, name, description, sort_order, created_at, created_by').eq('turma_id', turmaId).order('sort_order', { ascending: true });
  return (data ?? []) as TurmaSemester[];
}

export async function fetchTurmaSubjects(turmaId: string): Promise<TurmaSubject[]> {
  const { data } = await supabase.from('turma_subjects').select('id, turma_id, semester_id, parent_id, name, description, sort_order, created_at, created_by').eq('turma_id', turmaId).order('sort_order', { ascending: true });
  return (data ?? []) as TurmaSubject[];
}

export async function fetchTurmaLessons(turmaId: string): Promise<TurmaLesson[]> {
  const { data } = await supabase.from('turma_lessons').select('id, turma_id, subject_id, name, description, lesson_date, is_published, sort_order, created_at, created_by, summary, materials').eq('turma_id', turmaId).order('sort_order', { ascending: true });
  return (data ?? []) as TurmaLesson[];
}

interface TurmaDeckQueryRow {
  id: string;
  turma_id: string;
  deck_id: string;
  subject_id: string | null;
  lesson_id: string | null;
  shared_by: string;
  sort_order: number;
  is_published: boolean;
  price: number;
  price_type: string;
  allow_download: boolean;
  created_at: string;
}

export async function fetchTurmaDecks(turmaId: string): Promise<TurmaDeck[]> {
  const { data } = await supabase.from('turma_decks').select('id, turma_id, deck_id, subject_id, lesson_id, shared_by, sort_order, is_published, price, price_type, allow_download, created_at').eq('turma_id', turmaId);
  if (!data || data.length === 0) return [];

  const typedData = data as TurmaDeckQueryRow[];
  const deckIds = typedData.map(d => d.deck_id);

  const { data: sharedDecks } = await supabase.from('decks').select('id, name, user_id').in('id', deckIds);
  const deckMap = new Map((sharedDecks ?? []).map(d => [d.id, { name: d.name }]));

  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
  const directCountMap = new Map<string, number>();
  interface CardCountRow { deck_id: string; card_count: number }
  ((countRows ?? []) as CardCountRow[]).forEach(r => directCountMap.set(r.deck_id, Number(r.card_count)));

  const sharerIds = [...new Set(typedData.map(d => d.shared_by).filter(Boolean))];
  const sharerNameMap = new Map<string, string>();
  if (sharerIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sharerIds);
    (profiles ?? []).forEach(p => sharerNameMap.set(p.id, p.name));
  }

  return typedData.map(d => {
    const deckInfo = deckMap.get(d.deck_id);
    return {
      ...d,
      deck_name: deckInfo?.name || 'Sem nome',
      card_count: directCountMap.get(d.deck_id) ?? 0,
      parent_deck_id: null,
      is_published: d.is_published ?? true,
      shared_by_name: sharerNameMap.get(d.shared_by) || null,
    };
  });
}

export async function toggleDeckPublished(id: string, isPublished: boolean) {
  const { error } = await supabase.from('turma_decks').update({ is_published: isPublished }).eq('id', id);
  if (error) throw error;
}

// ── Hierarchy Mutations ──

export async function createSemester(turmaId: string, userId: string, name: string, description?: string) {
  const { data, error } = await supabase.from('turma_semesters').insert({ turma_id: turmaId, name, description: description ?? '', created_by: userId }).select().single();
  if (error) throw error; return data;
}
export async function deleteSemester(id: string) { const { error } = await supabase.from('turma_semesters').delete().eq('id', id); if (error) throw error; }
export async function createSubject(turmaId: string, userId: string, params: { name: string; description?: string; semesterId?: string | null; parentId?: string | null }) {
  const { data, error } = await supabase.from('turma_subjects').insert({ turma_id: turmaId, name: params.name, description: params.description ?? '', created_by: userId, semester_id: params.semesterId ?? null, parent_id: params.parentId ?? null }).select().single();
  if (error) throw error; return data;
}
export async function updateSubject(id: string, name: string) { const { error } = await supabase.from('turma_subjects').update({ name }).eq('id', id); if (error) throw error; }
export async function deleteSubject(id: string) {
  const { error } = await supabase.rpc('delete_subject_cascade', { p_subject_id: id });
  if (error) throw error;
}
export async function createLesson(turmaId: string, userId: string, params: { subjectId?: string | null; name: string; description?: string; lessonDate?: string | null; isPublished?: boolean }) {
  const { data, error } = await supabase.from('turma_lessons').insert({ turma_id: turmaId, subject_id: params.subjectId ?? null, name: params.name, description: params.description ?? '', created_by: userId, lesson_date: params.lessonDate ?? null, is_published: params.isPublished ?? true }).select().single();
  if (error) throw error; return data;
}
export async function deleteLesson(id: string) {
  const { error } = await supabase.rpc('delete_lesson_cascade', { p_lesson_id: id });
  if (error) throw error;
}

export async function updateLesson(id: string, params: { name?: string; lessonDate?: string | null; isPublished?: boolean }) {
  const updateData: { name?: string; lesson_date?: string | null; is_published?: boolean } = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.lessonDate !== undefined) updateData.lesson_date = params.lessonDate;
  if (params.isPublished !== undefined) updateData.is_published = params.isPublished;
  const { error } = await supabase.from('turma_lessons').update(updateData).eq('id', id); if (error) throw error;
}

export async function updateLessonContent(id: string, params: { summary?: string; materials?: { title: string; url: string }[] }) {
  const updateData: { summary?: string; materials?: { title: string; url: string }[] } = {};
  if (params.summary !== undefined) updateData.summary = params.summary;
  if (params.materials !== undefined) updateData.materials = params.materials;
  const { error } = await supabase.from('turma_lessons').update(updateData).eq('id', id); if (error) throw error;
}

export async function shareDeck(turmaId: string, userId: string, params: { deckId: string; subjectId?: string | null; lessonId?: string | null; price?: number; priceType?: string; allowDownload?: boolean }) {
  const { data: existingShares } = await supabase.from('turma_decks').select('id, deck_id').eq('turma_id', turmaId).eq('deck_id', params.deckId);
  if (existingShares && existingShares.length > 0) return;

  await supabase.from('decks').update({ is_public: true }).eq('id', params.deckId);

  const { error } = await supabase.from('turma_decks').insert({
    turma_id: turmaId,
    deck_id: params.deckId,
    subject_id: params.subjectId ?? null,
    lesson_id: params.lessonId ?? null,
    shared_by: userId,
    price: params.price ?? 0,
    price_type: params.priceType ?? 'free',
    allow_download: params.allowDownload ?? false,
  });
  if (error) throw error;
}

export async function updateDeckPricing(id: string, params: { price: number; priceType: string; allowDownload?: boolean }) {
  const updateData: { price: number; price_type: string; allow_download?: boolean } = { price: params.price, price_type: params.priceType };
  if (params.allowDownload !== undefined) updateData.allow_download = params.allowDownload;
  const { error } = await supabase.from('turma_decks').update(updateData).eq('id', id); if (error) throw error;
}
export async function unshareDeck(id: string) { const { error } = await supabase.from('turma_decks').delete().eq('id', id); if (error) throw error; }

/** Batch-update sort_order for turma subjects. */
export async function reorderSubjects(orderedIds: string[]) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
    const { error } = await (supabase.rpc as any)('batch_reorder_turma_subjects', { p_ids: orderedIds });
    if (error) throw error;
  } catch {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('turma_subjects').update({ sort_order: i }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
  }
}

/** Batch-update sort_order for turma decks. */
export async function reorderTurmaDecks(orderedIds: string[]) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
    const { error } = await (supabase.rpc as any)('batch_reorder_turma_decks', { p_ids: orderedIds });
    if (error) throw error;
  } catch {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('turma_decks').update({ sort_order: i }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
  }
}

/** Batch-update sort_order for turma lesson files. */
export async function reorderTurmaFiles(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('turma_lesson_files').update({ sort_order: i }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

/** Batch-update sort_order for turma exams. */
export async function reorderTurmaExams(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('turma_exams').update({ sort_order: i }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

// ── Turma Ratings ──

interface TurmaRatingRow {
  id: string;
  turma_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export async function fetchMyTurmaRating(turmaId: string, userId: string): Promise<TurmaRatingRow | null> {
  const { data } = await supabase.from('turma_ratings').select('id, turma_id, user_id, rating, comment, created_at').eq('turma_id', turmaId).eq('user_id', userId).maybeSingle();
  return data as TurmaRatingRow | null;
}

export async function submitTurmaRating(turmaId: string, userId: string, rating: number, comment?: string, existingId?: string) {
  if (existingId) {
    const { error } = await supabase.from('turma_ratings').update({ rating, comment: comment ?? '' }).eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('turma_ratings').insert({ turma_id: turmaId, user_id: userId, rating, comment: comment ?? '' });
    if (error) throw error;
  }
}

export async function fetchAllTurmaRatings(turmaId: string) {
  const { data: ratings } = await supabase
    .from('turma_ratings')
    .select('id, turma_id, user_id, rating, comment, created_at')
    .eq('turma_id', turmaId)
    .order('created_at', { ascending: false });
  if (!ratings || ratings.length === 0) return [];
  const typedRatings = ratings as TurmaRatingRow[];
  const userIds = [...new Set(typedRatings.map(r => r.user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, (p.name as string) || 'Anônimo']));
  return typedRatings.map(r => ({
    ...r,
    user_name: profileMap.get(r.user_id) ?? 'Anônimo',
  }));
}
