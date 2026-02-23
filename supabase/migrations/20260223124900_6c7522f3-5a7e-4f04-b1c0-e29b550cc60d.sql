-- Add is_public column to decks (default true = all decks are discoverable)
ALTER TABLE public.decks ADD COLUMN is_public boolean NOT NULL DEFAULT true;

-- RLS: anyone authenticated can view public decks
CREATE POLICY "Anyone can view public decks"
ON public.decks
FOR SELECT
USING (is_public = true AND auth.uid() IS NOT NULL);
