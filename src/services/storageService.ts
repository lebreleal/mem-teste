/**
 * Storage service — abstracts Supabase Storage operations.
 * Used by RichEditor, OcclusionEditor, ExampleReferenceSection.
 */

import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'card-images';

/** Upload an image file and return the public URL. */
export async function uploadImage(file: File, userId?: string, folder?: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'webp';
  const prefix = folder ? `${folder}/${userId ?? 'anon'}` : (userId ?? 'anon');
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

/** Upload a file (any type) and return the public URL. */
export async function uploadFile(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

/** Invoke detect-occlusion edge function. */
export async function invokeDetectOcclusion(imageUrl: string) {
  const { data, error } = await supabase.functions.invoke('detect-occlusion', {
    body: { imageUrl },
  });
  if (error) throw error;
  return data;
}
