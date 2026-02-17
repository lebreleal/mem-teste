
-- Create a table for organizing lesson content into folders
CREATE TABLE public.lesson_content_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.turma_lessons(id) ON DELETE CASCADE,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.lesson_content_folders(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lesson_content_folders ENABLE ROW LEVEL SECURITY;

-- Members can view folders
CREATE POLICY "Members can view lesson content folders"
ON public.lesson_content_folders
FOR SELECT
USING (is_turma_member(auth.uid(), turma_id));

-- Permitted users can create folders
CREATE POLICY "Permitted users can create lesson content folders"
ON public.lesson_content_folders
FOR INSERT
WITH CHECK (has_turma_permission(auth.uid(), turma_id, 'create_lesson'));

-- Creator or admin can update folders
CREATE POLICY "Creator or admin can update lesson content folders"
ON public.lesson_content_folders
FOR UPDATE
USING ((created_by = auth.uid()) OR (get_turma_role(auth.uid(), turma_id) = 'admin'::turma_role));

-- Creator or admin can delete folders
CREATE POLICY "Creator or admin can delete lesson content folders"
ON public.lesson_content_folders
FOR DELETE
USING ((created_by = auth.uid()) OR (get_turma_role(auth.uid(), turma_id) = 'admin'::turma_role));

-- Add folder_id columns to turma_lesson_files and turma_decks for organizing content
ALTER TABLE public.turma_lesson_files ADD COLUMN content_folder_id UUID REFERENCES public.lesson_content_folders(id) ON DELETE SET NULL;
ALTER TABLE public.turma_decks ADD COLUMN content_folder_id UUID REFERENCES public.lesson_content_folders(id) ON DELETE SET NULL;
