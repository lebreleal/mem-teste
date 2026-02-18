/**
 * Service layer for turmas (communities), members, hierarchy, exams, and ratings.
 */

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
  const { data: decks } = await supabase.from('decks').select('id, name').in('id', deckIds);
  const { data: cards } = await supabase.from('cards').select('deck_id').in('deck_id', deckIds);
  const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));
  const countMap = new Map<string, number>();
  (cards ?? []).forEach((c: any) => countMap.set(c.deck_id, (countMap.get(c.deck_id) ?? 0) + 1));
  return data.map((d: any) => ({ ...d, deck_name: deckMap.get(d.deck_id) || 'Sem nome', card_count: countMap.get(d.deck_id) ?? 0 }));
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
  const { error } = await supabase.from('turma_decks').insert({ turma_id: turmaId, deck_id: params.deckId, subject_id: params.subjectId ?? null, lesson_id: params.lessonId ?? null, shared_by: userId, price: params.price ?? 0, price_type: params.priceType ?? 'free', allow_download: params.allowDownload ?? false } as any);
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
    is_published: true, is_marketplace: params.isMarketplace || false, price: params.price || 0, total_questions: count || 0,
  } as any).eq('id', examId);
  if (error) throw error;
}

export async function deleteTurmaExam(examId: string) {
  const { error } = await supabase.rpc('delete_turma_exam_cascade', { p_exam_id: examId } as any);
  if (error) throw error;
}

export async function toggleExamSubscribersOnly(examId: string, subscribersOnly: boolean) {
  const { error } = await supabase.from('turma_exams').update({ subscribers_only: subscribersOnly } as any).eq('id', examId);
  if (error) throw error;
}

// ── Turma Exam Attempts ──

export async function fetchTurmaExamAttempts(examId: string, userId: string): Promise<TurmaExamAttempt[]> {
  const { data } = await supabase.from('turma_exam_attempts').select('*').eq('exam_id', examId).eq('user_id', userId).order('created_at', { ascending: false });
  return (data ?? []) as TurmaExamAttempt[];
}

export async function startTurmaExamAttempt(examId: string, userId: string, totalPoints: number) {
  const { data, error } = await supabase.from('turma_exam_attempts').insert({ exam_id: examId, user_id: userId, total_points: totalPoints } as any).select().single();
  if (error) throw error; return data;
}

export async function submitTurmaExamAnswer(params: { attemptId: string; questionId: string; userAnswer?: string; selectedIndices?: number[]; scoredPoints: number }) {
  const { error } = await supabase.from('turma_exam_answers').insert({
    attempt_id: params.attemptId, question_id: params.questionId, user_answer: params.userAnswer || null,
    selected_indices: params.selectedIndices || null, scored_points: params.scoredPoints, is_graded: true,
  } as any);
  if (error) throw error;
}

export async function completeTurmaExamAttempt(attemptId: string, scoredPoints: number) {
  const { error } = await supabase.from('turma_exam_attempts').update({
    status: 'completed', scored_points: scoredPoints, completed_at: new Date().toISOString(),
  } as any).eq('id', attemptId);
  if (error) throw error;
}

export async function restartTurmaExam(examId: string, userId: string) {
  // Delete all answers for user's attempts on this exam
  const { data: attempts } = await supabase
    .from('turma_exam_attempts').select('id').eq('exam_id', examId).eq('user_id', userId);
  if (attempts && attempts.length > 0) {
    const attemptIds = attempts.map((a: any) => a.id);
    await supabase.from('turma_exam_answers').delete().in('attempt_id', attemptIds);
    await supabase.from('turma_exam_attempts').delete().in('id', attemptIds);
  }
}

// ── Rating ──

export async function fetchMyTurmaRating(turmaId: string, userId: string) {
  const { data } = await supabase.from('turma_ratings').select('*').eq('turma_id', turmaId).eq('user_id', userId).maybeSingle();
  return data as { id: string; rating: number; comment: string | null } | null;
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
