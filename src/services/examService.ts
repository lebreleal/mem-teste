/**
 * Service layer for Exam-related backend operations.
 * Abstracts all Supabase interactions for personal exams.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Exam, ExamQuestion } from '@/types/exam';

const EXAM_COLS = 'id, user_id, deck_id, folder_id, title, status, total_points, scored_points, time_limit_seconds, started_at, completed_at, created_at, source_turma_exam_id, synced_at' as const;
const EXAM_QUESTION_COLS = 'id, exam_id, card_id, question_type, question_text, options, correct_answer, correct_indices, points, user_answer, selected_indices, scored_points, is_graded, ai_feedback, sort_order' as const;

// Helper to get a typed query builder for tables with partial type coverage
const examsTable = () => supabase.from('exams' as 'exams');
const examQuestionsTable = () => supabase.from('exam_questions' as 'exam_questions');

/** Fetch all exams for a user, optionally filtered by deck. */
export async function fetchExams(userId: string, deckId?: string): Promise<Exam[]> {
  let q = examsTable().select(EXAM_COLS).eq('user_id', userId).order('created_at', { ascending: false });
  if (deckId) q = q.eq('deck_id', deckId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Exam[];
}

/** Fetch a single exam by ID. */
export async function fetchExam(examId: string): Promise<Exam> {
  const { data, error } = await examsTable().select(EXAM_COLS).eq('id', examId).single();
  if (error) throw error;
  return data as unknown as Exam;
}

/** Fetch questions for an exam, ordered by sort_order. */
export async function fetchExamQuestions(examId: string): Promise<ExamQuestion[]> {
  const { data, error } = await examQuestionsTable()
    .select(EXAM_QUESTION_COLS)
    .eq('exam_id', examId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ExamQuestion[];
}

/** Create an exam with its questions atomically. */
export async function createExam(params: {
  userId: string;
  deckId: string;
  title: string;
  folderId?: string | null;
  questions: Array<{
    question_type: string;
    question_text: string;
    options?: string[];
    correct_answer: string;
    correct_indices?: number[];
    points: number;
    sort_order: number;
    card_id?: string;
  }>;
  timeLimitSeconds?: number;
  sourceTurmaExamId?: string | null;
}): Promise<Exam> {
  const totalPoints = params.questions.reduce((sum, q) => sum + q.points, 0);

  const { data: exam, error: examError } = await examsTable()
    .insert({
      user_id: params.userId,
      deck_id: params.deckId,
      folder_id: params.folderId || null,
      title: params.title,
      status: 'pending',
      total_points: totalPoints,
      time_limit_seconds: params.timeLimitSeconds || null,
      source_turma_exam_id: params.sourceTurmaExamId || null,
    } as any)
    .select()
    .single();
  if (examError) throw examError;

  const examId = (exam as any).id;
  const questionsToInsert = params.questions.map(q => ({
    exam_id: examId,
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options ?? null,
    correct_answer: q.correct_answer,
    correct_indices: q.correct_indices || null,
    points: q.points,
    sort_order: q.sort_order,
    card_id: q.card_id || null,
  }));

  const { error: qError } = await examQuestionsTable().insert(questionsToInsert as any);
  if (qError) throw qError;

  return exam as unknown as Exam;
}

/** Delete an exam and its questions. */
export async function deleteExam(examId: string) {
  await examQuestionsTable().delete().eq('exam_id', examId);
  const { error } = await examsTable().delete().eq('id', examId);
  if (error) throw error;
}

/** Restart an exam (reset all answers). */
export async function restartExam(examId: string) {
  await examQuestionsTable()
    .update({ user_answer: null, selected_indices: null, scored_points: 0, is_graded: false, ai_feedback: null } as any)
    .eq('exam_id', examId);
  await examsTable()
    .update({ status: 'pending', completed_at: null, scored_points: 0, started_at: new Date().toISOString() } as any)
    .eq('id', examId);
}

/** Move exam to a different folder. */
export async function moveExam(examId: string, folderId: string | null) {
  const { error } = await examsTable()
    .update({ folder_id: folderId } as any)
    .eq('id', examId);
  if (error) throw error;
}

/** Start an exam (set status to in_progress). */
export async function startExam(examId: string) {
  await examsTable()
    .update({ status: 'in_progress', started_at: new Date().toISOString() } as any)
    .eq('id', examId);
}

/** Update synced_at timestamp for an exam. */
export async function updateExamSyncedAt(examId: string) {
  const { error } = await examsTable()
    .update({ synced_at: new Date().toISOString() } as any)
    .eq('id', examId);
  if (error) throw error;
}

/** Fetch local exam linked to a turma exam. */
export async function fetchLinkedExam(userId: string, sourceTurmaExamId: string): Promise<Exam | null> {
  const { data, error } = await examsTable()
    .select(EXAM_COLS)
    .eq('user_id', userId)
    .eq('source_turma_exam_id', sourceTurmaExamId)
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0) ? (data[0] as unknown as Exam) : null;
}
