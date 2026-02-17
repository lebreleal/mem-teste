-- Add is_published column to turma_lessons (default true = always visible)
ALTER TABLE public.turma_lessons
ADD COLUMN is_published boolean NOT NULL DEFAULT true;