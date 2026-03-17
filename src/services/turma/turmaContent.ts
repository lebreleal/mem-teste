/**
 * Turma content operations: semesters, subjects, lessons, decks, files, ratings.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { TurmaSemester, TurmaSubject, TurmaLesson, TurmaDeck } from '@/types/turma';

// ── Hierarchy Queries ──

export async function fetchTurmaSemesters(turmaId: string): Promise<TurmaSemester[]> {
  const { data } = await supabase.from('turma_semesters').select('id, turma_id, name, description, sort_order, created_at, created_by').eq('turma_id', turmaId).order('sort_order', { ascending: true });
  return (data ?? []) as TurmaSemester[];
}

export async function fetchTurmaSubjects(turmaId: string): Promise<TurmaSubject[]> {
  const { data } = await supabase.from('turma_subjects').select('*').eq('turma_id', turmaId).order('sort_order', { ascending: true });
  return (data ?? []) as TurmaSubject[];
}

export async function fetchTurmaLessons(turmaId: string): Promise<TurmaLesson[]> {
  const { data } = await supabase.from('turma_lessons').select('*').eq('turma_id', turmaId).order('sort_order', { ascending: true });
  return (data ?? []) as TurmaLesson[];
}

export async function fetchTurmaDecks(turmaId: string): Promise<TurmaDeck[]> {
  const { data } = await supabase.from('turma_decks').select('*').eq('turma_id', turmaId);
  if (!data || data.length === 0) return [];

  const deckIds = data.map((d: any) => d.deck_id);

  // Fetch deck names (no sub-deck expansion)
  const { data: sharedDecks } = await supabase.from('decks').select('id, name, user_id').in('id', deckIds);
  const deckMap = new Map((sharedDecks ?? []).map((d: any) => [d.id, { name: d.name }]));

  // Count cards per deck (direct only, no sub-tree aggregation)
  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
  const directCountMap = new Map<string, number>();
  (countRows ?? []).forEach((r: any) => directCountMap.set(r.deck_id, Number(r.card_count)));

  // Fetch sharer profile names
  const sharerIds = [...new Set(data.map((d: any) => d.shared_by).filter(Boolean))];
  const sharerNameMap = new Map<string, string>();
  if (sharerIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sharerIds);
    (profiles ?? []).forEach((p: any) => sharerNameMap.set(p.id, p.name));
  }

  return data.map((d: any) => {
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
  const { error } = await supabase.from('turma_decks').update({ is_published: isPublished } as any).eq('id', id);
  if (error) throw error;
}

// ── Hierarchy Mutations ──

export async function createSemester(turmaId: string, userId: string, name: string, description?: string) {
  const { data, error } = await supabase.from('turma_semesters').insert({ turma_id: turmaId, name, description: description ?? '', created_by: userId } as any).select().single();
  if (error) throw error; return data;
}
export async function deleteSemester(id: string) { const { error } = await supabase.from('turma_semesters').delete().eq('id', id); if (error) throw error; }
export async function createSubject(turmaId: string, userId: string, params: { name: string; description?: string; semesterId?: string | null; parentId?: string | null }) {
  const { data, error } = await supabase.from('turma_subjects').insert({ turma_id: turmaId, name: params.name, description: params.description ?? '', created_by: userId, semester_id: params.semesterId ?? null, parent_id: params.parentId ?? null } as any).select().single();
  if (error) throw error; return data;
}
export async function updateSubject(id: string, name: string) { const { error } = await supabase.from('turma_subjects').update({ name } as any).eq('id', id); if (error) throw error; }
export async function deleteSubject(id: string) {
  const { error } = await supabase.rpc('delete_subject_cascade', { p_subject_id: id } as any);
  if (error) throw error;
}
export async function createLesson(turmaId: string, userId: string, params: { subjectId?: string | null; name: string; description?: string; lessonDate?: string | null; isPublished?: boolean }) {
  const { data, error } = await supabase.from('turma_lessons').insert({ turma_id: turmaId, subject_id: params.subjectId ?? null, name: params.name, description: params.description ?? '', created_by: userId, lesson_date: params.lessonDate ?? null, is_published: params.isPublished ?? true } as any).select().single();
  if (error) throw error; return data;
}
export async function deleteLesson(id: string) {
  const { error } = await supabase.rpc('delete_lesson_cascade', { p_lesson_id: id } as any);
  if (error) throw error;
}
export async function updateLesson(id: string, params: { name?: string; lessonDate?: string | null; isPublished?: boolean }) {
  const updateData: any = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.lessonDate !== undefined) updateData.lesson_date = params.lessonDate;
  if (params.isPublished !== undefined) updateData.is_published = params.isPublished;
  const { error } = await supabase.from('turma_lessons').update(updateData).eq('id', id); if (error) throw error;
}
export async function updateLessonContent(id: string, params: { summary?: string; materials?: { title: string; url: string }[] }) {
  const updateData: any = {};
  if (params.summary !== undefined) updateData.summary = params.summary;
  if (params.materials !== undefined) updateData.materials = params.materials;
  const { error } = await supabase.from('turma_lessons').update(updateData).eq('id', id); if (error) throw error;
}

export async function shareDeck(turmaId: string, userId: string, params: { deckId: string; subjectId?: string | null; lessonId?: string | null; price?: number; priceType?: string; allowDownload?: boolean }) {
  // Only share the selected deck (no sub-deck expansion)
  const { data: existingShares } = await supabase.from('turma_decks').select('id, deck_id').eq('turma_id', turmaId).eq('deck_id', params.deckId);
  if (existingShares && existingShares.length > 0) return; // Already shared

  await supabase.from('decks').update({ is_public: true } as any).eq('id', params.deckId);

  const { error } = await supabase.from('turma_decks').insert({
    turma_id: turmaId,
    deck_id: params.deckId,
    subject_id: params.subjectId ?? null,
    lesson_id: params.lessonId ?? null,
    shared_by: userId,
    price: params.price ?? 0,
    price_type: params.priceType ?? 'free',
    allow_download: params.allowDownload ?? false,
  } as any);
  if (error) throw error;
}

export async function updateDeckPricing(id: string, params: { price: number; priceType: string; allowDownload?: boolean }) {
  const updateData: any = { price: params.price, price_type: params.priceType };
  if (params.allowDownload !== undefined) updateData.allow_download = params.allowDownload;
  const { error } = await supabase.from('turma_decks').update(updateData).eq('id', id); if (error) throw error;
}
export async function unshareDeck(id: string) { const { error } = await supabase.from('turma_decks').delete().eq('id', id); if (error) throw error; }

/** Batch-update sort_order for turma subjects — uses single RPC when available. */
export async function reorderSubjects(orderedIds: string[]) {
  try {
    const { error } = await supabase.rpc('batch_reorder_turma_subjects' as any, { p_ids: orderedIds } as any);
    if (error) throw error;
  } catch {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('turma_subjects').update({ sort_order: i } as any).eq('id', orderedIds[i]);
      if (error) throw error;
    }
  }
}

/** Batch-update sort_order for turma decks — uses single RPC when available. */
export async function reorderTurmaDecks(orderedIds: string[]) {
  try {
    const { error } = await supabase.rpc('batch_reorder_turma_decks' as any, { p_ids: orderedIds } as any);
    if (error) throw error;
  } catch {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('turma_decks').update({ sort_order: i } as any).eq('id', orderedIds[i]);
      if (error) throw error;
    }
  }
}

/** Batch-update sort_order for turma lesson files. */
export async function reorderTurmaFiles(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('turma_lesson_files').update({ sort_order: i } as any).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

/** Batch-update sort_order for turma exams. */
export async function reorderTurmaExams(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('turma_exams').update({ sort_order: i } as any).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

// ── Turma Ratings ──

export async function fetchMyTurmaRating(turmaId: string, userId: string) {
  const { data } = await supabase.from('turma_ratings').select('*').eq('turma_id', turmaId).eq('user_id', userId).maybeSingle();
  return data as any;
}

export async function submitTurmaRating(turmaId: string, userId: string, rating: number, comment?: string, existingId?: string) {
  if (existingId) {
    const { error } = await supabase.from('turma_ratings').update({ rating, comment: comment ?? '' } as any).eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('turma_ratings').insert({ turma_id: turmaId, user_id: userId, rating, comment: comment ?? '' } as any);
    if (error) throw error;
  }
}

export async function fetchAllTurmaRatings(turmaId: string) {
  const { data: ratings } = await supabase
    .from('turma_ratings')
    .select('*')
    .eq('turma_id', turmaId)
    .order('created_at', { ascending: false });
  if (!ratings || ratings.length === 0) return [];
  const userIds = [...new Set(ratings.map((r: any) => r.user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));
  return ratings.map((r: any) => ({
    ...r,
    user_name: profileMap.get(r.user_id) ?? 'Anônimo',
  }));
}
