/**
 * Service layer for Folder-related backend operations.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Folder, FolderSection } from '@/types/folder';

export async function fetchFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, parent_id, is_archived, created_at, updated_at, user_id, section, source_turma_id, source_turma_subject_id, image_url, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Folder[];
}

export async function createFolder(
  userId: string,
  name: string,
  parentId?: string | null,
  section: FolderSection = 'personal'
) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, user_id: userId, parent_id: parentId ?? null, section } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFolder(id: string, updates: { name?: string; image_url?: string | null }) {
  const { error } = await supabase.from('folders').update(updates as any).eq('id', id);
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

/** Clear turma link from a folder (before leaving a sala). */
export async function clearFolderTurmaLink(folderId: string) {
  const { error } = await supabase
    .from('folders')
    .update({ source_turma_id: null, source_turma_subject_id: null } as any)
    .eq('id', folderId);
  if (error) throw error;
}

/** Upload a sala cover image and update the folder's image_url. */
export async function uploadFolderImage(folderId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const filePath = `sala-images/${folderId}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('deck-covers')
    .upload(filePath, file, { upsert: true });
  if (uploadErr) throw uploadErr;
  const { data: urlData } = supabase.storage.from('deck-covers').getPublicUrl(filePath);
  const imageUrl = urlData.publicUrl + '?t=' + Date.now();
  const { error } = await supabase.from('folders').update({ image_url: imageUrl } as any).eq('id', folderId);
  if (error) throw error;
  return imageUrl;
}

/** Batch-update sort_order for a list of folder IDs. */
export async function reorderFolders(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('folders').update({ sort_order: i } as any).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

/** Fetch image_url for a folder. */
export async function fetchFolderImageUrl(folderId: string): Promise<string | null> {
  const { data, error } = await supabase.from('folders').select('image_url').eq('id', folderId).single();
  if (error) return null;
  return data?.image_url ?? null;
}
