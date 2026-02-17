-- Allow turma members to view decks shared in their turmas
CREATE POLICY "Turma members can view shared decks"
ON public.decks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM turma_decks td
    WHERE td.deck_id = decks.id
    AND is_turma_member(auth.uid(), td.turma_id)
  )
);