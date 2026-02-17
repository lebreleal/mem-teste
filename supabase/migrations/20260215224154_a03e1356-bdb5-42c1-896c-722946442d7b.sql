
-- Create storage bucket for lesson files
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-files', 'lesson-files', true);

-- Storage policies for lesson files
CREATE POLICY "Members can view lesson files"
ON storage.objects FOR SELECT
USING (bucket_id = 'lesson-files');

CREATE POLICY "Authenticated users can upload lesson files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lesson-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Uploaders can delete own lesson files"
ON storage.objects FOR DELETE
USING (bucket_id = 'lesson-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create turma_lesson_files table
CREATE TABLE public.turma_lesson_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.turma_lessons(id) ON DELETE CASCADE,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type TEXT NOT NULL DEFAULT '',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.turma_lesson_files ENABLE ROW LEVEL SECURITY;

-- Members can view files
CREATE POLICY "Members can view lesson files"
ON public.turma_lesson_files FOR SELECT
USING (is_turma_member(auth.uid(), turma_id));

-- Permitted users can upload files
CREATE POLICY "Permitted users can upload lesson files"
ON public.turma_lesson_files FOR INSERT
WITH CHECK (has_turma_permission(auth.uid(), turma_id, 'create_lesson'::text));

-- Uploader or admin can delete files
CREATE POLICY "Uploader or admin can delete lesson files"
ON public.turma_lesson_files FOR DELETE
USING (uploaded_by = auth.uid() OR get_turma_role(auth.uid(), turma_id) = 'admin'::turma_role);
