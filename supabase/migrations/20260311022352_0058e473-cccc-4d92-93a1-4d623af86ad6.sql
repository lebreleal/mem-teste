-- Allow authenticated users to view decks belonging to public community turma_decks
CREATE POLICY "Authenticated can view decks for public communities"
ON decks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turma_decks td
    JOIN turmas t ON t.id = td.turma_id
    WHERE td.deck_id = decks.id
      AND td.is_published = true
      AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated users to view cards from public community decks
CREATE POLICY "Authenticated can view cards from public community decks"
ON cards FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turma_decks td
    JOIN turmas t ON t.id = td.turma_id
    WHERE td.deck_id = cards.deck_id
      AND td.is_published = true
      AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);