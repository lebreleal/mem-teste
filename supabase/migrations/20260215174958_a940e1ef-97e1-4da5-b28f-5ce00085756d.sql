
-- Create independent exam folders table
CREATE TABLE public.exam_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.exam_folders(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exam_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exam folders" ON public.exam_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exam folders" ON public.exam_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exam folders" ON public.exam_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exam folders" ON public.exam_folders FOR DELETE USING (auth.uid() = user_id);

-- Update exams.folder_id to reference exam_folders instead of folders
-- First drop the existing FK if it exists
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_folder_id_fkey;

-- Add new FK to exam_folders
ALTER TABLE public.exams ADD CONSTRAINT exams_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.exam_folders(id) ON DELETE SET NULL;

-- Migrate existing exam folders: copy any folders referenced by exams into exam_folders
INSERT INTO public.exam_folders (id, name, parent_id, user_id, is_archived, created_at, updated_at)
SELECT f.id, f.name, f.parent_id, f.user_id, f.is_archived, f.created_at, f.updated_at
FROM public.folders f
WHERE f.id IN (SELECT DISTINCT folder_id FROM public.exams WHERE folder_id IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER update_exam_folders_updated_at
BEFORE UPDATE ON public.exam_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
