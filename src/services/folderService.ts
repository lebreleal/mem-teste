/**
 * Service layer for Folder-related backend operations.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Folder } from '@/types/folder';

export async function fetchFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Folder[];
}

export async function createFolder(userId: string, name: string, parentId?: string | null) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, user_id: userId, parent_id: parentId ?? null } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFolder(id: string, name: string) {
  const { error } = await supabase.from('folders').update({ name } as any).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw error;
}

export async function archiveFolder(id: string) {
  const { data: folder } = await supabase.from('folders').select('is_archived').eq('id', id).single();
  const { error } = await supabase.from('folders').update({ is_archived: !(folder?.is_archived) } as any).eq('id', id);
  if (error) throw error;
}

export async function moveFolder(id: string, parentId: string | null) {
  const { error } = await supabase.from('folders').update({ parent_id: parentId } as any).eq('id', id);
  if (error) throw error;
}
