
-- Add lesson_date to turma_lessons
ALTER TABLE public.turma_lessons ADD COLUMN lesson_date date;

-- Create turma_semesters table
CREATE TABLE public.turma_semesters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view semesters" ON public.turma_semesters
  FOR SELECT USING (is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Permitted users can create semesters" ON public.turma_semesters
  FOR INSERT WITH CHECK (has_turma_permission(auth.uid(), turma_id, 'create_subject'));

CREATE POLICY "Creator or admin can update semesters" ON public.turma_semesters
  FOR UPDATE USING (created_by = auth.uid() OR get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Creator or admin can delete semesters" ON public.turma_semesters
  FOR DELETE USING (created_by = auth.uid() OR get_turma_role(auth.uid(), turma_id) = 'admin');

-- Add semester_id to turma_subjects
ALTER TABLE public.turma_subjects ADD COLUMN semester_id uuid REFERENCES public.turma_semesters(id) ON DELETE SET NULL;
