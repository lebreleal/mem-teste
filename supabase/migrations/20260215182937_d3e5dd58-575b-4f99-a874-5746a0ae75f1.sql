
-- Add rich text summary and materials (links) to lessons
ALTER TABLE public.turma_lessons 
ADD COLUMN summary text DEFAULT '',
ADD COLUMN materials jsonb DEFAULT '[]'::jsonb;

-- Add allow_download flag to turma_decks (admin controls if members can fully copy)
ALTER TABLE public.turma_decks 
ADD COLUMN allow_download boolean NOT NULL DEFAULT false;

-- Add source_turma_deck_id to decks to track linked copies from turmas
ALTER TABLE public.decks 
ADD COLUMN source_turma_deck_id uuid REFERENCES public.turma_decks(id) ON DELETE SET NULL DEFAULT NULL;
