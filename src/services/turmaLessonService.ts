/**
 * Service layer for Turma Lesson operations: files, content folders, and exam imports.
 * Extracted from LessonDetail.tsx for Law 2A compliance.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

// ── Typed table helpers (tables not in generated types) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_lesson_files not in generated types
const lessonFilesTable = () => (supabase.from as (t: string) => ReturnType<typeof supabase.from>)('turma_lesson_files');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_exams not in generated types
const turmaExamsTable = () => (supabase.from as (t: string) => ReturnType<typeof supabase.from>)('turma_exams');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_exam_questions not in generated types
const turmaExamQuestionsTable = () => (supabase.from as (t: string) => ReturnType<typeof supabase.from>)('turma_exam_questions');

// ── Lesson Files ──

const LESSON_FILE_COLS = 'id, lesson_id, turma_id, file_name, file_url, file_size, file_type, uploaded_by, price_type, content_folder_id, sort_order, created_at' as const;

export interface LessonFile {
  id: string;
  lesson_id: string;
  turma_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  file_type: string;
  uploaded_by: string;
  price_type?: string;
  content_folder_id?: string | null;
  sort_order?: number;
  created_at: string;
}

export async function fetchLessonFiles(lessonId: string): Promise<LessonFile[]> {
  const { data, error } = await lessonFilesTable()
    .select(LESSON_FILE_COLS)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LessonFile[];
}

export async function uploadLessonFile(params: {
  file: File;
  userId: string;
  turmaId: string;
  lessonId: string;
}): Promise<LessonFile> {
  const { file, userId, turmaId, lessonId } = params;
  const filePath = `${userId}/${turmaId}/${lessonId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage.from('lesson-files').upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('lesson-files').getPublicUrl(filePath);

  const { data, error } = await lessonFilesTable().insert({
    lesson_id: lessonId,
    turma_id: turmaId,
    file_name: file.name,
    file_url: urlData.publicUrl,
    file_size: file.size,
    file_type: file.type,
    uploaded_by: userId,
  }).select(LESSON_FILE_COLS).single();
  if (error) throw error;
  return data as unknown as LessonFile;
}

export async function deleteLessonFile(fileId: string): Promise<void> {
  const { error } = await lessonFilesTable().delete().eq('id', fileId);
  if (error) throw error;
}

export async function renameLessonFile(fileId: string, newName: string): Promise<void> {
  const { error } = await lessonFilesTable().update({ file_name: newName }).eq('id', fileId);
  if (error) throw error;
}

export async function updateLessonFileVisibility(fileId: string, priceType: string): Promise<void> {
  const { error } = await lessonFilesTable().update({ price_type: priceType }).eq('id', fileId);
  if (error) throw error;
}

// ── Content Folders ──

export interface LessonContentFolder {
  id: string;
  lesson_id: string;
  turma_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  created_by: string;
}

export async function fetchLessonContentFolders(lessonId: string): Promise<LessonContentFolder[]> {
  const { data, error } = await supabase
    .from('lesson_content_folders')
    .select('id, lesson_id, turma_id, name, parent_id, sort_order, created_at, created_by')
    .eq('lesson_id', lessonId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as unknown as LessonContentFolder[];
}

export async function createLessonContentFolder(params: {
  lessonId: string;
  turmaId: string;
  name: string;
  parentId: string | null;
  createdBy: string;
}): Promise<void> {
  const { error } = await supabase.from('lesson_content_folders').insert({
    lesson_id: params.lessonId,
    turma_id: params.turmaId,
    name: params.name,
    parent_id: params.parentId,
    created_by: params.createdBy,
  });
  if (error) throw error;
}

export async function renameLessonContentFolder(folderId: string, newName: string): Promise<void> {
  const { error } = await supabase.from('lesson_content_folders').update({ name: newName }).eq('id', folderId);
  if (error) throw error;
}

export async function deleteLessonContentFolder(folderId: string): Promise<void> {
  const { error } = await supabase.from('lesson_content_folders').delete().eq('id', folderId);
  if (error) throw error;
}

// ── Move Item (file or deck) into a content folder ──

export async function moveLessonItem(params: {
  itemType: 'file' | 'deck';
  itemId: string;
  targetFolderId: string | null;
}): Promise<void> {
  if (params.itemType === 'file') {
    const { error } = await lessonFilesTable().update({ content_folder_id: params.targetFolderId }).eq('id', params.itemId);
    if (error) throw error;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_decks not in generated types
    const { error } = await (supabase.from as (t: string) => ReturnType<typeof supabase.from>)('turma_decks')
      .update({ content_folder_id: params.targetFolderId }).eq('id', params.itemId);
    if (error) throw error;
  }
}

// ── Public Profiles (used for sharer names) ──

export async function fetchPublicProfiles(userIds: string[]): Promise<{ id: string; name: string; creator_tier: number }[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
  if (error) throw error;
  return (data ?? []) as { id: string; name: string; creator_tier: number }[];
}

// ── Deck Collection helpers (for addToCollection / downloadDeck) ──

export async function fetchUserDecksForSync(userId: string) {
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, folder_id, parent_deck_id, source_turma_deck_id, is_archived')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string; name: string; folder_id: string | null;
    parent_deck_id: string | null; source_turma_deck_id: string | null; is_archived: boolean;
  }>;
}

export async function fetchOriginalDeckInfo(deckId: string) {
  const { data, error } = await supabase
    .from('decks')
    .select('name, algorithm_mode, daily_new_limit, daily_review_limit')
    .eq('id', deckId)
    .single();
  if (error) throw error;
  return data as { name: string; algorithm_mode: string; daily_new_limit: number; daily_review_limit: number };
}

export async function createDeckWithSource(params: {
  name: string;
  userId: string;
  folderId: string;
  parentDeckId: string | null;
  algorithmMode?: string;
  dailyNewLimit?: number;
  dailyReviewLimit?: number;
  sourceTurmaDeckId?: string | null;
}) {
  const { data, error } = await supabase.from('decks').insert({
    name: params.name,
    user_id: params.userId,
    folder_id: params.folderId,
    parent_deck_id: params.parentDeckId,
    algorithm_mode: params.algorithmMode ?? 'fsrs',
    daily_new_limit: params.dailyNewLimit ?? 20,
    daily_review_limit: params.dailyReviewLimit ?? 9999,
    source_turma_deck_id: params.sourceTurmaDeckId ?? null,
  }).select('id, name').single();
  if (error) throw error;
  return data as { id: string; name: string };
}

export async function fetchCardsForCopy(deckId: string) {
  const { data, error } = await supabase
    .from('cards')
    .select('front_content, back_content, card_type')
    .eq('deck_id', deckId);
  if (error) throw error;
  return (data ?? []) as Array<{ front_content: string; back_content: string; card_type: string }>;
}

export async function insertCardCopies(deckId: string, cards: Array<{ front_content: string; back_content: string; card_type: string }>) {
  if (cards.length === 0) return;
  const rows = cards.map(c => ({ deck_id: deckId, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type }));
  const { error } = await supabase.from('cards').insert(rows);
  if (error) throw error;
}

export async function unarchiveDeck(deckId: string): Promise<void> {
  const { error } = await supabase.from('decks').update({ is_archived: false }).eq('id', deckId);
  if (error) throw error;
}

export async function linkDeckToTurmaSource(deckId: string, sourceTurmaDeckId: string): Promise<void> {
  const { error } = await supabase.from('decks').update({ source_turma_deck_id: sourceTurmaDeckId }).eq('id', deckId);
  if (error) throw error;
}

export async function unarchiveFolder(folderId: string): Promise<void> {
  const { error } = await supabase.from('folders').update({ is_archived: false }).eq('id', folderId);
  if (error) throw error;
}

// ── Import Exam from Personal → Turma ──

interface ExamQuestionRow {
  question_type: string;
  question_text: string;
  options: Json | null;
  correct_answer: string;
  correct_indices: number[] | null;
  points: number;
  sort_order: number;
}

export async function importExamToTurma(params: {
  examId: string;
  turmaId: string;
  userId: string;
  lessonId: string;
  subjectId: string | null;
  title: string;
  timeLimitSeconds: number | null;
}): Promise<void> {
  // Fetch personal exam questions
  const { data: questions, error } = await supabase
    .from('exam_questions')
    .select('question_type, question_text, options, correct_answer, correct_indices, points, sort_order')
    .eq('exam_id', params.examId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  if (!questions?.length) throw new Error('Prova sem questões');

  const typedQuestions = questions as unknown as ExamQuestionRow[];

  // Create turma exam
  const { data: turmaExam, error: examError } = await turmaExamsTable()
    .insert({
      turma_id: params.turmaId,
      created_by: params.userId,
      title: params.title,
      time_limit_seconds: params.timeLimitSeconds,
      is_published: true,
      total_questions: typedQuestions.length,
      lesson_id: params.lessonId,
      subject_id: params.subjectId,
    })
    .select('id')
    .single();
  if (examError) throw examError;

  const examId = (turmaExam as unknown as { id: string }).id;

  // Insert questions
  const questionsToInsert = typedQuestions.map((q, idx) => ({
    exam_id: examId,
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options ?? null,
    correct_answer: q.correct_answer,
    correct_indices: q.correct_indices || null,
    points: q.points,
    sort_order: idx,
  }));
  const { error: qError } = await turmaExamQuestionsTable().insert(questionsToInsert);
  if (qError) throw qError;
}

// ── Import Turma Exam → Personal ──

export async function importTurmaExamToPersonal(params: {
  examId: string;
  userId: string;
  title: string;
  timeLimitSeconds: number | null;
}): Promise<string> {
  // Fetch turma exam questions
  const { data: questions, error } = await turmaExamQuestionsTable()
    .select('question_type, question_text, options, correct_answer, correct_indices, points, sort_order')
    .eq('exam_id', params.examId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const typedQuestions = (questions ?? []) as unknown as ExamQuestionRow[];
  const totalPoints = typedQuestions.reduce((sum, q) => sum + (q.points || 1), 0);

  // Create personal exam
  const { data: newExam, error: examError } = await supabase.from('exams')
    .insert({
      user_id: params.userId,
      deck_id: null,
      title: params.title,
      status: 'pending',
      total_points: totalPoints,
      time_limit_seconds: params.timeLimitSeconds || null,
      source_turma_exam_id: params.examId,
    })
    .select('id')
    .single();
  if (examError) throw examError;

  const newExamId = (newExam as { id: string }).id;

  // Insert questions
  const questionsToInsert = typedQuestions.map((q, idx) => ({
    exam_id: newExamId,
    question_type: q.question_type,
    question_text: q.question_text,
    options: q.options ?? null,
    correct_answer: q.correct_answer,
    correct_indices: q.correct_indices || null,
    points: q.points,
    sort_order: idx,
  }));
  await supabase.from('exam_questions').insert(questionsToInsert);

  return newExamId;
}
