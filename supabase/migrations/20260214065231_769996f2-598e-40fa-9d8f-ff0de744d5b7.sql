
-- Add pricing columns to turma_decks
ALTER TABLE public.turma_decks ADD COLUMN price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.turma_decks ADD COLUMN price_type text NOT NULL DEFAULT 'free'; -- 'free', 'money', 'credits'

-- Add shared_by_name convenience: we'll fetch via profiles join instead
