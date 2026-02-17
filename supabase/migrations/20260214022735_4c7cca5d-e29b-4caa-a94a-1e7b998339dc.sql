
-- Fix 1: Allow authenticated users to find turmas by invite_code (for joining)
CREATE POLICY "Anyone authenticated can find turma by invite code"
ON public.turmas
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Fix 2: Allow reading cards from decks that are published in marketplace
CREATE POLICY "Users can view cards from published marketplace listings"
ON public.cards
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.marketplace_listings ml
    WHERE ml.deck_id = cards.deck_id
    AND ml.is_published = true
  )
);

-- Fix 3: Add source_listing_id to decks to track imported deck origin
ALTER TABLE public.decks ADD COLUMN source_listing_id uuid REFERENCES public.marketplace_listings(id) DEFAULT NULL;
