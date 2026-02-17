
-- Allow turma members to view cards from decks shared in their turma
CREATE POLICY "Turma members can view shared deck cards"
ON public.cards
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.turma_decks td
    WHERE td.deck_id = cards.deck_id
    AND public.is_turma_member(auth.uid(), td.turma_id)
  )
);
