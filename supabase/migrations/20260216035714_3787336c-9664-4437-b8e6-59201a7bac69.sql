
ALTER TABLE public.exams ADD COLUMN source_turma_exam_id uuid REFERENCES public.turma_exams(id) ON DELETE SET NULL DEFAULT NULL;
