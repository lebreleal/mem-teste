-- Allow authenticated users to view cards from public decks
CREATE POLICY "Users can view cards from public decks"
ON public.cards
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decks
    WHERE decks.id = cards.deck_id
    AND decks.is_public = true
  )
  AND auth.uid() IS NOT NULL
);