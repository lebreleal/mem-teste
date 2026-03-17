/**
 * Turma exam operations.
 * Extracted from turmaService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { TurmaExam, TurmaExamQuestion, TurmaExamAttempt } from '@/types/turma';

// ── Row interfaces ──

interface ExamRow {
  id: string;
  turma_id: string;
  title: string;
  description: string;
  subject_id: string | null;
  lesson_id: string | null;
  created_by: string;
  is_published: boolean;
  is_marketplace: boolean;
  subscribers_only?: boolean;
  price: number;
  time_limit_seconds: number | null;
  total_questions: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ProfileIdName {
  id: string;
  name: string;
}

interface BankQuestionRow {
  id: string;
  question_text: string;
  question_type: string;
  options: Json | null;
  correct_answer: string;
  correct_indices: number[] | null;
  points: number;
}

interface CardRow {
  id: string;
  front_content: string;
  back_content: string;
}

interface AttemptIdRow {
  id: string;
}

interface PointsRow {
  points: number;
}

// ── Typed table helpers — use `as any` for non-generated tables ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const turmaExamsTable = () => supabase.from('turma_exams' as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const turmaExamQuestionsTable = () => supabase.from('turma_exam_questions' as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const turmaExamAttemptsTable = () => supabase.from('turma_exam_attempts' as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const turmaExamAnswersTable = () => supabase.from('turma_exam_answers' as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const turmaQuestionsTable = () => supabase.from('turma_questions' as any);

export async function fetchTurmaExams(turmaId: string): Promise<TurmaExam[]> {
  const { data, error } = await turmaExamsTable().select('id, turma_id, title, description, subject_id, lesson_id, created_by, is_published, is_marketplace, subscribers_only, price, time_limit_seconds, total_questions, sort_order, created_at, updated_at').eq('turma_id', turmaId).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as ExamRow[];
  const creatorIds = [...new Set(rows.map(e => e.created_by))];
  const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', creatorIds);
  const profileMap = new Map(((profiles ?? []) as ProfileIdName[]).map(p => [p.id, p.name]));
  return rows.map(exam => ({ ...exam, creator_name: profileMap.get(exam.created_by) || 'Anônimo' })) as unknown as TurmaExam[];
}

export async function fetchTurmaExamQuestions(examId: string): Promise<TurmaExamQuestion[]> {
  const { data, error } = await turmaExamQuestionsTable().select('id, exam_id, question_id, question_text, question_type, options, correct_answer, correct_indices, points, sort_order, created_at').eq('exam_id', examId).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as TurmaExamQuestion[];
}

export async function createTurmaExam(turmaId: string, userId: string, params: { title: string; description?: string; subjectId?: string; lessonId?: string; timeLimitSeconds?: number }) {
  const { data, error } = await turmaExamsTable().insert({
    turma_id: turmaId, created_by: userId, title: params.title, description: params.description || '',
    subject_id: params.subjectId || null, lesson_id: params.lessonId || null, time_limit_seconds: params.timeLimitSeconds || null,
  }).select().single();
  if (error) throw error; return data;
}

export async function addQuestionToExam(params: { examId: string; questionText: string; questionType: string; options?: Json; correctAnswer: string; correctIndices?: number[]; points?: number; questionId?: string }) {
  const { data, error } = await turmaExamQuestionsTable().insert({
    exam_id: params.examId, question_text: params.questionText, question_type: params.questionType,
    options: params.options || null, correct_answer: params.correctAnswer, correct_indices: params.correctIndices || null,
    points: params.points || 1, question_id: params.questionId || null,
  }).select().single();
  if (error) throw error; return data;
}

export async function addQuestionsFromBank(examId: string, questionIds: string[]) {
  const { data: questions, error } = await turmaQuestionsTable().select('id, question_text, question_type, options, correct_answer, correct_indices, points').in('id', questionIds);
  if (error) throw error;
  const rows = (questions ?? []) as unknown as BankQuestionRow[];
  const inserts = rows.map((q, i) => ({
    exam_id: examId, question_id: q.id, question_text: q.question_text, question_type: q.question_type,
    options: q.options, correct_answer: q.correct_answer, correct_indices: q.correct_indices, points: q.points || 1, sort_order: i,
  }));
  const { error: insertError } = await turmaExamQuestionsTable().insert(inserts);
  if (insertError) throw insertError;
}

export async function addQuestionsFromDeck(examId: string, deckId: string, count?: number) {
  const { data: cards, error } = await supabase.from('cards').select('id, front_content, back_content').eq('deck_id', deckId).limit(count || 20);
  if (error) throw error;
  const rows = (cards ?? []) as CardRow[];
  const inserts = rows.map((c, i) => ({
    exam_id: examId, question_text: c.front_content, question_type: 'written', correct_answer: c.back_content, points: 1, sort_order: i,
  }));
  const { error: insertError } = await turmaExamQuestionsTable().insert(inserts);
  if (insertError) throw insertError;
}

export async function publishTurmaExam(examId: string, params: { isMarketplace?: boolean; price?: number }) {
  const { count } = await turmaExamQuestionsTable().select('*', { count: 'exact', head: true }).eq('exam_id', examId);
  const { error } = await turmaExamsTable().update({
    is_published: true, is_marketplace: params.isMarketplace ?? false,
    price: params.price ?? 0, total_questions: count ?? 0,
  }).eq('id', examId);
  if (error) throw error;
}

export async function toggleExamSubscribersOnly(examId: string, subscribersOnly: boolean) {
  const { error } = await turmaExamsTable().update({ subscribers_only: subscribersOnly }).eq('id', examId);
  if (error) throw error;
}

export async function deleteTurmaExam(examId: string) {
  await turmaExamQuestionsTable().delete().eq('exam_id', examId);
  const { error } = await turmaExamsTable().delete().eq('id', examId);
  if (error) throw error;
}

export async function startTurmaExamAttempt(examId: string, userId: string, totalPoints?: number): Promise<TurmaExamAttempt> {
  let tp = totalPoints;
  if (tp === undefined) {
    const { data: questions } = await turmaExamQuestionsTable().select('points').eq('exam_id', examId);
    tp = ((questions ?? []) as unknown as PointsRow[]).reduce((sum, q) => sum + (q.points || 1), 0);
  }
  const { data, error } = await turmaExamAttemptsTable().insert({ exam_id: examId, user_id: userId, total_points: tp }).select().single();
  if (error) throw error;
  return data as unknown as TurmaExamAttempt;
}

export async function submitTurmaExamAnswers(attemptId: string, answers: { questionId: string; userAnswer?: string; selectedIndices?: number[] }[]) {
  const inserts = answers.map(a => ({ attempt_id: attemptId, question_id: a.questionId, user_answer: a.userAnswer ?? null, selected_indices: a.selectedIndices ?? null }));
  const { error } = await turmaExamAnswersTable().insert(inserts);
  if (error) throw error;
}

export async function submitTurmaExamAnswer(params: { attemptId: string; questionId: string; userAnswer?: string; selectedIndices?: number[]; scoredPoints: number }) {
  const { error } = await turmaExamAnswersTable().insert({
    attempt_id: params.attemptId, question_id: params.questionId,
    user_answer: params.userAnswer ?? null, selected_indices: params.selectedIndices ?? null,
    scored_points: params.scoredPoints, is_graded: true,
  });
  if (error) throw error;
}

export async function completeTurmaExamAttempt(attemptId: string, scoredPoints: number) {
  const { error } = await turmaExamAttemptsTable().update({ status: 'completed', completed_at: new Date().toISOString(), scored_points: scoredPoints }).eq('id', attemptId);
  if (error) throw error;
}

export async function fetchTurmaExamAttempts(examId: string, userId: string): Promise<TurmaExamAttempt[]> {
  const { data, error } = await turmaExamAttemptsTable().select('id, exam_id, user_id, status, total_points, scored_points, started_at, completed_at, created_at').eq('exam_id', examId).eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TurmaExamAttempt[];
}

export async function fetchMyAttempts(examId: string, userId: string): Promise<TurmaExamAttempt[]> {
  return fetchTurmaExamAttempts(examId, userId);
}

export async function fetchAttemptAnswers(attemptId: string) {
  const { data, error } = await turmaExamAnswersTable().select('id, attempt_id, question_id, user_answer, selected_indices, scored_points, is_graded, ai_feedback, created_at').eq('attempt_id', attemptId);
  if (error) throw error;
  return data ?? [];
}

export async function restartTurmaExam(examId: string, userId: string) {
  const { data: attempts } = await turmaExamAttemptsTable().select('id').eq('exam_id', examId).eq('user_id', userId);
  if (attempts && attempts.length > 0) {
    const attemptIds = (attempts as unknown as AttemptIdRow[]).map(a => a.id);
    await turmaExamAnswersTable().delete().in('attempt_id', attemptIds);
    await turmaExamAttemptsTable().delete().eq('exam_id', examId).eq('user_id', userId);
  }
}
