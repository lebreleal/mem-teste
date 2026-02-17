
-- Allow sharer or admin to update turma_decks (for pricing changes)
CREATE POLICY "Sharer or admin can update deck" ON public.turma_decks
  FOR UPDATE USING (shared_by = auth.uid() OR get_turma_role(auth.uid(), turma_id) = 'admin');
