
-- Add parent_deck_id to support sub-decks (decks inside decks)
ALTER TABLE public.decks ADD COLUMN parent_deck_id uuid REFERENCES public.decks(id) ON DELETE CASCADE DEFAULT NULL;

-- Create index for performance
CREATE INDEX idx_decks_parent_deck_id ON public.decks(parent_deck_id);
