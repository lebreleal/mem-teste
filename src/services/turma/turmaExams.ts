/**
 * Turma exam operations.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { TurmaExam, TurmaExamQuestion, TurmaExamAttempt } from '@/types/turma';

export async function fetchTurmaExams(turmaId: string): Promise<TurmaExam[]> {
  const { data, error } = await supabase.from('turma_exams').select('id, turma_id, title, description, subject_id, lesson_id, created_by, is_published, is_marketplace, subscribers_only, price, time_limit_seconds, total_questions, sort_order, created_at, updated_at').eq('turma_id', turmaId).order('created_at', { ascending: false });
  if (error) throw error;
  const creatorIds = [...new Set((data ?? []).map((e: any) => e.created_by))];
  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', creatorIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name]));
  return (data ?? []).map((exam: any) => ({ ...exam, creator_name: profileMap.get(exam.created_by) || 'Anônimo' })) as TurmaExam[];
}

export async function fetchTurmaExamQuestions(examId: string): Promise<TurmaExamQuestion[]> {
  const { data, error } = await supabase.from('turma_exam_questions').select('id, exam_id, question_id, question_text, question_type, options, correct_answer, correct_indices, points, sort_order, created_at').eq('exam_id', examId).order('sort_order', { ascending: true });
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
  const { data: questions, error } = await supabase.from('turma_questions').select('id, question_text, question_type, options, correct_answer, correct_indices, points').in('id', questionIds);
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
  const { data, error } = await supabase.from('turma_exam_attempts').select('id, exam_id, user_id, status, total_points, scored_points, started_at, completed_at, created_at').eq('exam_id', examId).eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TurmaExamAttempt[];
}

export async function fetchMyAttempts(examId: string, userId: string): Promise<TurmaExamAttempt[]> {
  return fetchTurmaExamAttempts(examId, userId);
}

export async function fetchAttemptAnswers(attemptId: string) {
  const { data, error } = await supabase.from('turma_exam_answers').select('id, attempt_id, question_id, user_answer, selected_indices, scored_points, is_graded, ai_feedback, created_at').eq('attempt_id', attemptId);
  if (error) throw error;
  return data ?? [];
}

export async function restartTurmaExam(examId: string, userId: string) {
  const { data: attempts } = await supabase.from('turma_exam_attempts').select('id').eq('exam_id', examId).eq('user_id', userId);
  if (attempts && attempts.length > 0) {
    const attemptIds = attempts.map((a: any) => a.id);
    await supabase.from('turma_exam_answers').delete().in('attempt_id', attemptIds);
    await supabase.from('turma_exam_attempts').delete().eq('exam_id', examId).eq('user_id', userId);
  }
}
