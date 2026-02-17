
-- Allow admins to update turma_members (for role changes)
CREATE POLICY "Admin can update turma members"
  ON public.turma_members FOR UPDATE
  USING (public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- Allow admins to remove members
CREATE POLICY "Admin can delete turma members"
  ON public.turma_members FOR DELETE
  USING (auth.uid() = user_id OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- Drop the old restrictive delete policy first
DROP POLICY IF EXISTS "Users can leave turmas" ON public.turma_members;
