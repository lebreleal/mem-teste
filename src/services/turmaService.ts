import { supabase } from '@/integrations/supabase/client';
import { calculateStreak, getMascotState } from '@/lib/streakUtils';
import type {
  Turma, TurmaMember, TurmaMemberWithStats, TurmaRole,
  TurmaSemester, TurmaSubject, TurmaLesson, TurmaDeck,
  TurmaExam, TurmaExamQuestion, TurmaExamAttempt,
} from '@/types/turma';

// ── Turmas CRUD ──

export async function fetchUserTurmas(userId: string): Promise<Turma[]> {
  const { data: memberships } = await supabase
    .from('turma_members').select('turma_id').eq('user_id', userId);

  if (!memberships || memberships.length === 0) {
    const { data: owned } = await supabase.from('turmas').select('*').eq('owner_id', userId);
    return (owned ?? []) as Turma[];
  }

  const turmaIds = memberships.map(m => (m as any).turma_id);
  const { data: turmas } = await supabase
    .from('turmas').select('*').or(`id.in.(${turmaIds.join(',')}),owner_id.eq.${userId}`);
  return (turmas ?? []) as Turma[];
}

export async function fetchTurma(turmaId: string): Promise<Turma | null> {
  const { data } = await supabase.from('turmas').select('*').eq('id', turmaId).single();
  return data as Turma | null;
}

export async function fetchTurmaMembersWithStats(turmaId: string): Promise<TurmaMemberWithStats[]> {
  const { data: members } = await supabase.from('turma_members').select('user_id, role').eq('turma_id', turmaId);
  if (!members) return [];
  const userIds = members.map(m => (m as any).user_id);
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  if (!profiles) return [];

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const results: TurmaMemberWithStats[] = [];

  for (const profile of profiles) {
    const p = profile as any;
    const { data: logs } = await supabase.from('review_logs').select('reviewed_at').eq('user_id', p.id)
      .gte('reviewed_at', thirtyDaysAgo.toISOString()).order('reviewed_at', { ascending: false });
    const totalReviews = logs?.length ?? 0;
    const lastStudy = logs && logs.length > 0 ? new Date(logs[0].reviewed_at) : null;
    const streak = logs ? calculateStreak(logs.map(l => l.reviewed_at)) : 0;
    const mascotState = getMascotState(lastStudy);

    results.push({ user_id: p.id, user_name: p.name || 'Anônimo', user_email: '', streak, energy: 0, mascot_state: mascotState, total_reviews: totalReviews });
  }
  results.sort((a, b) => b.total_reviews - a.total_reviews);
  return results;
}

export async function createTurma(userId: string, name: string, description?: string) {
  const { data, error } = await supabase
    .from('turmas').insert({ name, description: description ?? '', owner_id: userId } as any).select().single();
  if (error) throw error;
  await supabase.from('turma_members').insert({ turma_id: (data as any).id, user_id: userId, role: 'admin' } as any);
  return data;
}

export async function joinTurmaByCode(userId: string, inviteCode: string) {
  const { data: results, error: findError } = await supabase
    .rpc('find_turma_by_invite_code', { p_invite_code: inviteCode.trim() });
  const turma = Array.isArray(results) ? results[0] : results;
  if (findError || !turma) throw new Error('Código inválido');
  const { error } = await supabase.from('turma_members').insert({ turma_id: turma.id, user_id: userId } as any);
  if (error) { if (error.code === '23505') throw new Error('Você já está nesta comunidade'); throw error; }
  return turma;
}

export async function joinTurmaById(userId: string, turmaId: string) {
  const { error } = await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: userId } as any);
  if (error) { if (error.code === '23505') throw new Error('Você já está nesta comunidade'); throw error; }
}

export async function leaveTurma(turmaId: string) {
  const { error } = await supabase.rpc('leave_turma', { _turma_id: turmaId } as any);
  if (error) throw error;
}

export async function updateTurma(turmaId: string, updates: { name?: string; description?: string; isPrivate?: boolean; coverImageUrl?: string; subscriptionPrice?: number }) {
  const data: Record<string, any> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.isPrivate !== undefined) data.is_private = updates.isPrivate;
  if (updates.coverImageUrl !== undefined) data.cover_image_url = updates.coverImageUrl;
  if (updates.subscriptionPrice !== undefined) data.subscription_price = updates.subscriptionPrice;
  const { error } = await supabase.from('turmas').update(data as any).eq('id', turmaId);
  if (error) throw error;
}

// ── Discover ──

export async function fetchDiscoverTurmas(userId: string, searchQuery: string): Promise<(Turma & { member_count: number; owner_name: string })[]> {
  let query = supabase.from('turmas').select('*').eq('is_private', false);
  if (searchQuery.trim()) query = query.or(`name.ilike.%${searchQuery.trim()}%,description.ilike.%${searchQuery.trim()}%`);
  const { data: turmas } = await query.order('created_at', { ascending: false }).limit(50);
  if (!turmas || turmas.length === 0) return [];

  const ownerIds = [...new Set(turmas.map((t: any) => t.owner_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  const turmaIds = turmas.map((t: any) => t.id);
  const { data: members } = await supabase.from('turma_members').select('turma_id').in('turma_id', turmaIds);
  const countMap = new Map<string, number>();
  (members ?? []).forEach((m: any) => countMap.set(m.turma_id, (countMap.get(m.turma_id) ?? 0) + 1));

  return turmas.map((t: any) => ({
    ...t, member_count: countMap.get(t.id) ?? 0, owner_name: profileMap.get(t.owner_id) ?? 'Anônimo',
    avg_rating: t.avg_rating ?? 0, rating_count: t.rating_count ?? 0,
  }));
}

// ── Ranking ──

export async function fetchTurmaRanking(turmaId: string): Promise<TurmaMemberWithStats[]> {
  const { data: members } = await supabase.from('turma_members').select('user_id').eq('turma_id', turmaId);
  if (!members || members.length === 0) return [];
  const userIds = members.map(m => (m as any).user_id);
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  if (!profiles) return [];

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const results: TurmaMemberWithStats[] = [];

  for (const profile of profiles) {
    const p = profile as any;
    const { data: logs } = await supabase.from('review_logs').select('reviewed_at').eq('user_id', p.id)
      .gte('reviewed_at', thirtyDaysAgo.toISOString()).order('reviewed_at', { ascending: false });
    const totalReviews = logs?.length ?? 0;
    const lastStudy = logs && logs.length > 0 ? new Date(logs[0].reviewed_at) : null;
    const streak = logs ? calculateStreak(logs.map(l => l.reviewed_at)) : 0;
    const mascotState = getMascotState(lastStudy);

    results.push({ user_id: p.id, user_name: p.name || 'Anônimo', user_email: '', streak, energy: 0, mascot_state: mascotState, total_reviews: totalReviews });
  }
  results.sort((a, b) => b.total_reviews - a.total_reviews);
  return results;
}

// ── Hierarchy (members, semesters, subjects, lessons, decks) ──

export async function fetchTurmaRole(userId: string, turmaId: string): Promise<TurmaRole | null> {
  const { data } = await supabase.from('turma_members').select('role').eq('turma_id', turmaId).eq('user_id', userId).single();
  return (data as any)?.role ?? null;
}

export async function fetchTurmaMembers(turmaId: string): Promise<TurmaMember[]> {
  const { data: members } = await supabase.from('turma_members').select('user_id, role, is_subscriber').eq('turma_id', turmaId);
  if (!members) return [];
  const userIds = members.map(m => (m as any).user_id);
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return members.map((m: any) => {
    const p = profileMap.get(m.user_id) as any;
    return { user_id: m.user_id, role: m.role, user_name: p?.name || 'Anônimo', user_email: '', is_subscriber: m.is_subscriber ?? false };
  });
}

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

  // Fetch shared decks
  const { data: sharedDecks } = await supabase.from('decks').select('id, name, parent_deck_id, user_id').in('id', deckIds);

  // Recursively fetch ALL children from decks table (even if not in turma_decks)
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

  // Auto-create missing turma_deck entries for discovered children
  const missingChildren = allDecks.filter((d: any) => !tdByDeckId.has(d.id));
  if (missingChildren.length > 0) {
    const rows = missingChildren.map((child: any) => {
      // Find closest ancestor with a turma_deck entry for inheriting settings
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
      // Permission denied for non-admin – ignore, counting still works
    }
  }

  // Fetch card counts for all discovered decks
  const allDeckIdsExpanded = allDecks.map((d: any) => d.id);
  const { data: cards } = await supabase.from('cards').select('deck_id').in('deck_id', allDeckIdsExpanded);
  const directCountMap = new Map<string, number>();
  (cards ?? []).forEach((c: any) => directCountMap.set(c.deck_id, (directCountMap.get(c.deck_id) ?? 0) + 1));

  const deckMap = new Map(allDecks.map((d: any) => [d.id, { name: d.name, parent_deck_id: d.parent_deck_id }]));

  // Collect published subtree using FULL hierarchy (not just turma_decks)
  const collectPublishedSubtree = (rootDeckId: string): string[] => {
    const result: string[] = [rootDeckId];
    const children = allDecks.filter((d: any) => d.parent_deck_id === rootDeckId);
    for (const child of children) {
      const td = tdByDeckId.get(child.id);
      // If no turma_deck entry exists yet, include it; if entry exists, check is_published
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
  // Fetch all user decks to find hierarchy
  const { data: allDecks } = await supabase.from('decks').select('id, parent_deck_id, name').eq('user_id', userId);
  const decks = allDecks ?? [];

  // Collect this deck + all descendants
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

  // Check which are already shared in this turma
  const { data: existingShares } = await supabase.from('turma_decks').select('id, deck_id').eq('turma_id', turmaId).in('deck_id', allDeckIds);
  const alreadyShared = new Set((existingShares ?? []).map(s => s.deck_id));

  // Insert only the ones not yet shared
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

  // Mark all decks in hierarchy as public so they're visible via RLS
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

/** Batch-update sort_order for turma subjects. */
export async function reorderSubjects(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('turma_subjects').update({ sort_order: i } as any).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

/** Batch-update sort_order for turma decks. */
export async function reorderTurmaDecks(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('turma_decks').update({ sort_order: i } as any).eq('id', orderedIds[i]);
    if (error) throw error;
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
export async function changeMemberRole(turmaId: string, userId: string, role: TurmaRole) {
  const { error } = await supabase.from('turma_members').update({ role } as any).eq('turma_id', turmaId).eq('user_id', userId); if (error) throw error;
}
export async function removeMember(turmaId: string, userId: string) {
  const { error } = await supabase.from('turma_members').delete().eq('turma_id', turmaId).eq('user_id', userId); if (error) throw error;
}
export async function toggleSubscriber(turmaId: string, userId: string, isSubscriber: boolean) {
  const { error } = await supabase.from('turma_members').update({ is_subscriber: isSubscriber } as any).eq('turma_id', turmaId).eq('user_id', userId); if (error) throw error;
}

// ── Turma Exams ──

export async function fetchTurmaExams(turmaId: string): Promise<TurmaExam[]> {
  const { data, error } = await supabase.from('turma_exams').select('*').eq('turma_id', turmaId).order('created_at', { ascending: false });
  if (error) throw error;
  const creatorIds = [...new Set((data ?? []).map((e: any) => e.created_by))];
  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', creatorIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]));
  return (data ?? []).map((exam: any) => ({ ...exam, creator_name: profileMap.get(exam.created_by) || 'Anônimo' })) as TurmaExam[];
}

export async function fetchTurmaExamQuestions(examId: string): Promise<TurmaExamQuestion[]> {
  const { data, error } = await supabase.from('turma_exam_questions').select('*').eq('exam_id', examId).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TurmaExamQuestion[];
}

export async function createTurmaExam(turmaId: string, userId: string, params: { title: string; description?: string; subjectId?: string; lessonId?: string; timeLimitSeconds?: number }) {
  const { data, error } = await supabase.from('turma_exams').insert({
    turma_id: turmaId, created_by: userId, title: params.title, description: params.description || '',
    subject_id: params.subjectId || null, lesson_id: params.lessonId || null, time_limit_seconds: params.timeLimitSeconds || null,
  } as any).select().single();
  if (error) throw error; return data;
}

export async function addQuestionToExam(params: { examId: string; questionText: string; questionType: string; options?: any; correctAnswer: string; correctIndices?: number[]; points?: number; questionId?: string }) {
  const { data, error } = await supabase.from('turma_exam_questions').insert({
    exam_id: params.examId, question_text: params.questionText, question_type: params.questionType,
    options: params.options || null, correct_answer: params.correctAnswer, correct_indices: params.correctIndices || null,
    points: params.points || 1, question_id: params.questionId || null,
  } as any).select().single();
  if (error) throw error; return data;
}

export async function addQuestionsFromBank(examId: string, questionIds: string[]) {
  const { data: questions, error } = await supabase.from('turma_questions').select('*').in('id', questionIds);
  if (error) throw error;
  const inserts = (questions ?? []).map((q: any, i: number) => ({
    exam_id: examId, question_id: q.id, question_text: q.question_text, question_type: q.question_type,
    options: q.options, correct_answer: q.correct_answer, correct_indices: q.correct_indices, points: q.points || 1, sort_order: i,
  }));
  const { error: insertError } = await supabase.from('turma_exam_questions').insert(inserts as any);
  if (insertError) throw insertError;
}

export async function addQuestionsFromDeck(examId: string, deckId: string, count?: number) {
  const { data: cards, error } = await supabase.from('cards').select('id, front_content, back_content').eq('deck_id', deckId).limit(count || 20);
  if (error) throw error;
  const inserts = (cards ?? []).map((c: any, i: number) => ({
    exam_id: examId, question_text: c.front_content, question_type: 'written', correct_answer: c.back_content, points: 1, sort_order: i,
  }));
  const { error: insertError } = await supabase.from('turma_exam_questions').insert(inserts as any);
  if (insertError) throw insertError;
}

export async function publishTurmaExam(examId: string, params: { isMarketplace?: boolean; price?: number }) {
  const { count } = await supabase.from('turma_exam_questions').select('*', { count: 'exact', head: true }).eq('exam_id', examId);
  const { error } = await supabase.from('turma_exams').update({
    is_published: true, is_marketplace: params.isMarketplace ?? false,
    price: params.price ?? 0, total_questions: count ?? 0,
  } as any).eq('id', examId);
  if (error) throw error;
}

export async function toggleExamSubscribersOnly(examId: string, subscribersOnly: boolean) {
  const { error } = await supabase.from('turma_exams').update({ subscribers_only: subscribersOnly } as any).eq('id', examId);
  if (error) throw error;
}

export async function deleteTurmaExam(examId: string) {
  await supabase.from('turma_exam_questions').delete().eq('exam_id', examId);
  const { error } = await supabase.from('turma_exams').delete().eq('id', examId);
  if (error) throw error;
}

export async function startTurmaExamAttempt(examId: string, userId: string, totalPoints?: number): Promise<TurmaExamAttempt> {
  let tp = totalPoints;
  if (tp === undefined) {
    const { data: questions } = await supabase.from('turma_exam_questions').select('points').eq('exam_id', examId);
    tp = (questions ?? []).reduce((sum: number, q: any) => sum + (q.points || 1), 0);
  }
  const { data, error } = await supabase.from('turma_exam_attempts').insert({ exam_id: examId, user_id: userId, total_points: tp } as any).select().single();
  if (error) throw error;
  return data as TurmaExamAttempt;
}

export async function submitTurmaExamAnswers(attemptId: string, answers: { questionId: string; userAnswer?: string; selectedIndices?: number[] }[]) {
  const inserts = answers.map(a => ({ attempt_id: attemptId, question_id: a.questionId, user_answer: a.userAnswer ?? null, selected_indices: a.selectedIndices ?? null }));
  const { error } = await supabase.from('turma_exam_answers').insert(inserts as any);
  if (error) throw error;
}

export async function submitTurmaExamAnswer(params: { attemptId: string; questionId: string; userAnswer?: string; selectedIndices?: number[]; scoredPoints: number }) {
  const { error } = await supabase.from('turma_exam_answers').insert({
    attempt_id: params.attemptId, question_id: params.questionId,
    user_answer: params.userAnswer ?? null, selected_indices: params.selectedIndices ?? null,
    scored_points: params.scoredPoints, is_graded: true,
  } as any);
  if (error) throw error;
}

export async function completeTurmaExamAttempt(attemptId: string, scoredPoints: number) {
  const { error } = await supabase.from('turma_exam_attempts').update({ status: 'completed', completed_at: new Date().toISOString(), scored_points: scoredPoints } as any).eq('id', attemptId);
  if (error) throw error;
}

export async function fetchTurmaExamAttempts(examId: string, userId: string): Promise<TurmaExamAttempt[]> {
  const { data, error } = await supabase.from('turma_exam_attempts').select('*').eq('exam_id', examId).eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TurmaExamAttempt[];
}

export async function fetchMyAttempts(examId: string, userId: string): Promise<TurmaExamAttempt[]> {
  return fetchTurmaExamAttempts(examId, userId);
}

export async function fetchAttemptAnswers(attemptId: string) {
  const { data, error } = await supabase.from('turma_exam_answers').select('*').eq('attempt_id', attemptId);
  if (error) throw error;
  return data ?? [];
}

export async function restartTurmaExam(examId: string, userId: string) {
  // Delete all previous attempts for this user on this exam
  const { data: attempts } = await supabase.from('turma_exam_attempts').select('id').eq('exam_id', examId).eq('user_id', userId);
  if (attempts && attempts.length > 0) {
    const attemptIds = attempts.map((a: any) => a.id);
    await supabase.from('turma_exam_answers').delete().in('attempt_id', attemptIds);
    await supabase.from('turma_exam_attempts').delete().eq('exam_id', examId).eq('user_id', userId);
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

// ── Community Preview ──

export async function fetchCreatorStats(ownerId: string) {
  const { data: decks } = await supabase.from('turma_decks').select('deck_id').eq('shared_by', ownerId);
  const totalDecks = decks?.length ?? 0;
  let totalCards = 0;
  if (decks && decks.length > 0) {
    const deckIds = decks.map((d: any) => d.deck_id);
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', deckIds);
    totalCards = count ?? 0;
  }
  const { count: examCount } = await supabase.from('turma_exams').select('id', { count: 'exact', head: true }).eq('created_by', ownerId);
  const { count: reviewCount } = await supabase.from('review_logs').select('id', { count: 'exact', head: true }).eq('user_id', ownerId);
  return { totalDecks, totalCards, totalReviews: reviewCount ?? 0, totalExams: examCount ?? 0 };
}

export async function fetchCommunityContentStats(turmaId: string) {
  const { data, error } = await supabase.rpc('get_community_preview_stats', { p_turma_id: turmaId });
  if (error || !data) return { subjects: [], rootLessons: [] };
  const d = data as any;
  return {
    subjects: (d.subjects ?? []).map((s: any) => ({ id: s.id, name: s.name, lessonCount: s.lessonCount ?? 0, cardCount: s.cardCount ?? 0, fileCount: s.fileCount ?? 0 })),
    rootLessons: (d.rootLessons ?? []).map((l: any) => ({ id: l.id, name: l.name })),
  };
}

// ── Public Decks Discovery ──

export interface PublicDeckItem {
  id: string;
  name: string;
  card_count: number;
  owner_name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export async function fetchPublicDecks(searchQuery: string): Promise<PublicDeckItem[]> {
  // Fetch ALL public decks (not just roots) — each level appears independently
  let query = supabase.from('decks').select('id, name, user_id, parent_deck_id, created_at, updated_at').eq('is_public', true);
  if (searchQuery.trim()) query = query.ilike('name', `%${searchQuery.trim()}%`);
  const { data: decks } = await query.order('created_at', { ascending: false }).limit(200);
  if (!decks || decks.length === 0) return [];

  const ownerIds = [...new Set(decks.map((d: any) => d.user_id))];
  const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: ownerIds });
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

  // Build parent→children map from the fetched decks themselves
  const childrenMap = new Map<string, string[]>();
  const deckMap = new Map(decks.map((d: any) => [d.id, d]));
  decks.forEach((d: any) => {
    if (d.parent_deck_id && deckMap.has(d.parent_deck_id)) {
      const list = childrenMap.get(d.parent_deck_id) ?? [];
      list.push(d.id);
      childrenMap.set(d.parent_deck_id, list);
    }
  });

  // Also fetch children that might not be public themselves but belong to hierarchy
  // (for card counting purposes)
  const allFetchedIds = new Set(decks.map((d: any) => d.id));
  let parentIds = [...allFetchedIds];
  while (parentIds.length > 0) {
    const { data: children } = await supabase.from('decks').select('id, parent_deck_id, updated_at').in('parent_deck_id', parentIds);
    const newChildren = (children ?? []).filter((c: any) => !allFetchedIds.has(c.id));
    if (newChildren.length === 0) break;
    newChildren.forEach((c: any) => {
      allFetchedIds.add(c.id);
      const list = childrenMap.get(c.parent_deck_id) ?? [];
      list.push(c.id);
      childrenMap.set(c.parent_deck_id, list);
    });
    parentIds = newChildren.map((c: any) => c.id);
  }

  const collectSubtree = (rootId: string): string[] => {
    const result = [rootId];
    for (const childId of (childrenMap.get(rootId) ?? [])) {
      result.push(...collectSubtree(childId));
    }
    return result;
  };

  // Count cards per deck using server-side RPC (avoids 1000-row limit)
  const allDeckIds = [...allFetchedIds];
  const directCountMap = new Map<string, number>();
  const { data: counts } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
  (counts ?? []).forEach((r: any) => directCountMap.set(r.deck_id, Number(r.card_count)));

  return decks.map((d: any) => {
    const subtreeIds = collectSubtree(d.id);
    const aggregatedCount = subtreeIds.reduce((sum, id) => sum + (directCountMap.get(id) ?? 0), 0);

    return {
      id: d.id,
      name: d.name,
      card_count: aggregatedCount,
      owner_name: profileMap.get(d.user_id) ?? 'Anônimo',
      owner_id: d.user_id,
      created_at: d.created_at,
      updated_at: d.updated_at,
    };
  });
}
