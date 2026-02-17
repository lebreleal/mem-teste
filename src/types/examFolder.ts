/**
 * Domain types for exam folders.
 */

export interface ExamFolder {
  id: string;
  name: string;
  parent_id: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}
