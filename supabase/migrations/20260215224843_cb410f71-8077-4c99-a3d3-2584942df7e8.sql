
-- Add parent_id to turma_subjects for nested folders
ALTER TABLE public.turma_subjects ADD COLUMN parent_id uuid REFERENCES public.turma_subjects(id) ON DELETE CASCADE DEFAULT NULL;

-- Make subject_id nullable on turma_lessons to allow root-level lessons
ALTER TABLE public.turma_lessons ALTER COLUMN subject_id DROP NOT NULL;
