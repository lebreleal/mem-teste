/**
 * Storage service — abstracts Supabase Storage operations.
 * Used by RichEditor, OcclusionEditor, ExampleReferenceSection.
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUtils';

const BUCKET = 'card-images';
// 1 year — images are immutable (unique UUID filenames), so cache aggressively
// in the browser and CDN. Avoids re-downloading images every study session.
const LONG_CACHE = '31536000';

/** Upload an image file and return the public URL. */
export async function uploadImage(userId: string, file: File, folder?: string): Promise<string> {
  const optimized = await compressImage(file);
  const ext = optimized.name.split('.').pop() || 'webp';
  const prefix = folder ? `${folder}/${userId}` : userId;
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized, { cacheControl: LONG_CACHE });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

/** Upload a file (any type) and return the public URL. */
export async function uploadFile(userId: string, file: File): Promise<string> {
  // compressImage is a no-op for non-image inputs.
  const optimized = await compressImage(file);
  const ext = optimized.name.split('.').pop();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized, { cacheControl: LONG_CACHE });
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
