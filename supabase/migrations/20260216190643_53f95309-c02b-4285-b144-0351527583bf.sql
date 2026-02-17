
-- Add price_type to turma_lesson_files for independent visibility control per file
ALTER TABLE public.turma_lesson_files ADD COLUMN price_type text NOT NULL DEFAULT 'free';
