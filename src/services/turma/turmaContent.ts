/**
 * Turma content operations: semesters, subjects, lessons, decks, files, ratings.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { TurmaSemester, TurmaSubject, TurmaLesson, TurmaDeck } from '@/types/turma';

// ── Hierarchy Queries ──

export async function fetchTurmaSemesters(turmaId: string): Promise<TurmaSemester[]> {
  const { data } = await supabase.from('turma_semesters').select('*').eq('turma_id', turmaId).order('sort_order', { ascending: true });
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
  const tdByDeckId = new Map<string, any>(data.map((d: any) => [d.deck_id, d]));

  const { data: sharedDecks } = await supabase.from('decks').select('id, name, parent_deck_id, user_id').in('id', deckIds);

  let allDecks = [...(sharedDecks ?? [])];
  const seenIds = new Set(deckIds);
  let parentIdsToCheck = [...deckIds];

  while (parentIdsToCheck.length > 0) {
    const { data: children } = await supabase.from('decks').select('id, name, parent_deck_id, user_id').in('parent_deck_id', parentIdsToCheck);
    const newChildren = (children ?? []).filter((c: any) => !seenIds.has(c.id));
    if (newChildren.length === 0) break;
    newChildren.forEach((c: any) => seenIds.add(c.id));
    allDecks.push(...newChildren);
    parentIdsToCheck = newChildren.map((c: any) => c.id);
  }

  const missingChildren = allDecks.filter((d: any) => !tdByDeckId.has(d.id));
  if (missingChildren.length > 0) {
    const rows = missingChildren.map((child: any) => {
      let parentTd: any = null;
      let cur: any = child;
      while (cur?.parent_deck_id) {
        parentTd = tdByDeckId.get(cur.parent_deck_id);
        if (parentTd) break;
        cur = allDecks.find((d: any) => d.id === cur.parent_deck_id);
      }
      return {
        turma_id: turmaId,
        deck_id: child.id,
        subject_id: parentTd?.subject_id ?? null,
        lesson_id: parentTd?.lesson_id ?? null,
        shared_by: parentTd?.shared_by ?? child.user_id,
        price: 0,
        price_type: 'free',
        allow_download: parentTd?.allow_download ?? false,
      };
    });
    try {
      const { data: inserted } = await supabase.from('turma_decks').insert(rows as any).select();
      if (inserted) {
        inserted.forEach((td: any) => {
          data.push(td);
          tdByDeckId.set(td.deck_id, td);
        });
      }
    } catch {
      // Permission denied for non-admin – ignore
    }
  }

  const allDeckIdsExpanded = allDecks.map((d: any) => d.id);
  const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIdsExpanded });
  const directCountMap = new Map<string, number>();
  (countRows ?? []).forEach((r: any) => directCountMap.set(r.deck_id, Number(r.card_count)));

  const deckMap = new Map(allDecks.map((d: any) => [d.id, { name: d.name, parent_deck_id: d.parent_deck_id }]));

  const collectPublishedSubtree = (rootDeckId: string): string[] => {
    const result: string[] = [rootDeckId];
    const children = allDecks.filter((d: any) => d.parent_deck_id === rootDeckId);
    for (const child of children) {
      const td = tdByDeckId.get(child.id);
      if (!td || td.is_published !== false) {
        result.push(...collectPublishedSubtree(child.id));
      }
    }
    return result;
  };

  return data.map((d: any) => {
    const deckInfo = deckMap.get(d.deck_id);
    const subtreeIds = collectPublishedSubtree(d.deck_id);
    const aggregatedCount = subtreeIds.reduce((sum, id) => sum + (directCountMap.get(id) ?? 0), 0);
    return { ...d, deck_name: deckInfo?.name || 'Sem nome', card_count: aggregatedCount, parent_deck_id: deckInfo?.parent_deck_id ?? null, is_published: d.is_published ?? true };
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
  const { data: allDecks } = await supabase.from('decks').select('id, parent_deck_id, name').eq('user_id', userId);
  const decks = allDecks ?? [];

  const collectDescendants = (parentId: string): string[] => {
    const children = decks.filter(d => d.parent_deck_id === parentId);
    const result: string[] = [];
    for (const child of children) {
      result.push(child.id);
      result.push(...collectDescendants(child.id));
    }
    return result;
  };

  const allDeckIds = [params.deckId, ...collectDescendants(params.deckId)];

  const { data: existingShares } = await supabase.from('turma_decks').select('id, deck_id').eq('turma_id', turmaId).in('deck_id', allDeckIds);
  const alreadyShared = new Set((existingShares ?? []).map(s => s.deck_id));

  const toInsert = allDeckIds.filter(id => !alreadyShared.has(id));
  if (toInsert.length === 0) return;

  const rows = toInsert.map(deckId => ({
    turma_id: turmaId,
    deck_id: deckId,
    subject_id: params.subjectId ?? null,
    lesson_id: params.lessonId ?? null,
    shared_by: userId,
    price: params.price ?? 0,
    price_type: params.priceType ?? 'free',
    allow_download: params.allowDownload ?? false,
  }));

  await supabase.from('decks').update({ is_public: true } as any).in('id', toInsert);

  const { error } = await supabase.from('turma_decks').insert(rows as any);
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
    const { error } = await supabase.rpc('batch_reorder_turma_subjects', { p_ids: orderedIds } as any);
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
    const { error } = await supabase.rpc('batch_reorder_turma_decks', { p_ids: orderedIds } as any);
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
