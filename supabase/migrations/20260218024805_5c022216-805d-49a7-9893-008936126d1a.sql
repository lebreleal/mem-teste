
-- Fix exam folder deletion: set folder_id to NULL when folder is deleted
ALTER TABLE public.exams DROP CONSTRAINT exams_folder_id_fkey;
ALTER TABLE public.exams ADD CONSTRAINT exams_folder_id_fkey 
  FOREIGN KEY (folder_id) REFERENCES public.exam_folders(id) ON DELETE SET NULL;

-- Fix exam folder parent deletion: cascade delete child folders
ALTER TABLE public.exam_folders DROP CONSTRAINT exam_folders_parent_id_fkey;
ALTER TABLE public.exam_folders ADD CONSTRAINT exam_folders_parent_id_fkey 
  FOREIGN KEY (parent_id) REFERENCES public.exam_folders(id) ON DELETE CASCADE;

-- Fix deck folder deletion: set folder_id to NULL when folder is deleted (backup for RPC)
ALTER TABLE public.decks DROP CONSTRAINT decks_folder_id_fkey;
ALTER TABLE public.decks ADD CONSTRAINT decks_folder_id_fkey 
  FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;

-- Fix folder parent deletion cascade
ALTER TABLE public.folders DROP CONSTRAINT folders_parent_id_fkey;
ALTER TABLE public.folders ADD CONSTRAINT folders_parent_id_fkey 
  FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;

-- Allow deleting turma_decks even when other users have imported copies
ALTER TABLE public.decks DROP CONSTRAINT decks_source_turma_deck_id_fkey;
ALTER TABLE public.decks ADD CONSTRAINT decks_source_turma_deck_id_fkey 
  FOREIGN KEY (source_turma_deck_id) REFERENCES public.turma_decks(id) ON DELETE SET NULL;

-- Allow deleting turma_exams even when users have imported copies
ALTER TABLE public.exams DROP CONSTRAINT exams_source_turma_exam_id_fkey;
ALTER TABLE public.exams ADD CONSTRAINT exams_source_turma_exam_id_fkey 
  FOREIGN KEY (source_turma_exam_id) REFERENCES public.turma_exams(id) ON DELETE SET NULL;
