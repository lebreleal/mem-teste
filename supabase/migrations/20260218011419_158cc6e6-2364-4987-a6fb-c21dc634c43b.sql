
-- Add sort_order to folders (dashboard)
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Add sort_order to decks (dashboard)
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Add sort_order to turma_decks (community)
ALTER TABLE public.turma_decks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Add sort_order to turma_lesson_files (community)
ALTER TABLE public.turma_lesson_files ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
