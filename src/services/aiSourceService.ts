/**
 * Service layer for managing AI sources (persistent text/file context for AI generation).
 * Sources expire after 30 days automatically.
 */

import { supabase } from '@/integrations/supabase/client';

export interface AISource {
  id: string;
  user_id: string;
  source_type: 'text' | 'file';
  name: string;
  text_content: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  expires_at: string;
  created_at: string;
}

/** Fetch all non-expired sources for the current user. */
export async function fetchAISources(): Promise<AISource[]> {
  const { data, error } = await supabase
    .from('user_ai_sources')
    .select('id, user_id, source_type, name, text_content, file_path, file_size, mime_type, expires_at, created_at')
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as AISource[];
}

/** Save a text-based AI source. */
export async function saveTextSource(userId: string, name: string, textContent: string): Promise<AISource> {
  const { data, error } = await supabase
    .from('user_ai_sources')
    .insert({
      user_id: userId,
      source_type: 'text',
      name,
      text_content: textContent,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as AISource;
}

/** Upload a file to storage and save a file-based AI source. */
export async function saveFileSource(userId: string, file: File): Promise<AISource> {
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('ai-sources')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('user_ai_sources')
    .insert({
      user_id: userId,
      source_type: 'file',
      name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as AISource;
}

/** Delete a source (and its file from storage if applicable). */
export async function deleteAISource(source: AISource): Promise<void> {
  if (source.source_type === 'file' && source.file_path) {
    await supabase.storage.from('ai-sources').remove([source.file_path]);
  }
  const { error } = await supabase
    .from('user_ai_sources')
    .delete()
    .eq('id', source.id);
  if (error) throw error;
}

/** Download the file content as text (for file-based sources). */
export async function downloadSourceFileAsText(source: AISource): Promise<string> {
  if (!source.file_path) throw new Error('No file path');

  const { data, error } = await supabase.storage
    .from('ai-sources')
    .download(source.file_path);

  if (error) throw error;
  if (!data) throw new Error('Empty file');

  const isPdf = source.mime_type === 'application/pdf' || source.file_path.endsWith('.pdf');

  if (isPdf) {
    // Return the blob for PDF processing by the caller
    throw new Error('PDF_NEEDS_PARSING');
  }

  // For text-based files, just read as text
  return await data.text();
}

/** Get a temporary signed URL for downloading/re-parsing a file source. */
export async function getSourceFileUrl(source: AISource): Promise<string> {
  if (!source.file_path) throw new Error('No file path');

  const { data, error } = await supabase.storage
    .from('ai-sources')
    .createSignedUrl(source.file_path, 3600); // 1 hour

  if (error) throw error;
  return data.signedUrl;
}
