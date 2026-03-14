/**
 * Domain types for Folders (deck organizers).
 */

export type FolderSection = 'personal' | 'community';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  section?: FolderSection;
  source_turma_id?: string | null;
  source_turma_subject_id?: string | null;
  image_url?: string | null;
}
