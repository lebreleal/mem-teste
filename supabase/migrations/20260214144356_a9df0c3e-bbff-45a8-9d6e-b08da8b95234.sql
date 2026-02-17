
-- Add folder_id to exams table for organizing exams in folders
ALTER TABLE public.exams ADD COLUMN folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;
