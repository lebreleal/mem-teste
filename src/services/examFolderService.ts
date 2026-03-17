/**
 * Service layer for exam folder CRUD.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ExamFolder } from '@/types/examFolder';
export type { ExamFolder } from '@/types/examFolder';

const examFoldersTable = () => supabase.from('exam_folders' as 'exam_folders');

/** Fetch all exam folders for the user. */
export async function fetchExamFolders(): Promise<ExamFolder[]> {
  const { data, error } = await examFoldersTable()
    .select('id, name, parent_id, is_archived, created_at, updated_at, user_id')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ExamFolder[];
}

/** Create an exam folder. */
export async function createExamFolder(userId: string, name: string, parentId?: string | null) {
  const { data, error } = await examFoldersTable()
    .insert({ name, user_id: userId, parent_id: parentId ?? null } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Rename an exam folder. */
export async function updateExamFolder(id: string, name: string) {
  const { error } = await examFoldersTable()
    .update({ name } as any)
    .eq('id', id);
  if (error) throw error;
}

/** Delete an exam folder. */
export async function deleteExamFolder(id: string) {
  const { error } = await examFoldersTable().delete().eq('id', id);
  if (error) throw error;
}

/** Move an exam folder to a new parent. */
export async function moveExamFolder(id: string, parentId: string | null) {
  const { error } = await examFoldersTable()
    .update({ parent_id: parentId } as any)
    .eq('id', id);
  if (error) throw error;
}
