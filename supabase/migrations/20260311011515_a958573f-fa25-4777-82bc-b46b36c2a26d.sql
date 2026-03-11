-- Drop and recreate the turma_subjects policy to avoid conflict
DROP POLICY IF EXISTS "Anon can view turma_subjects for public communities" ON public.turma_subjects;
CREATE POLICY "Anon can view turma_subjects for public communities"
ON public.turma_subjects FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_subjects.turma_id
      AND t.share_slug IS NOT NULL
  )
);

-- Same for turma_members if it already existed
DROP POLICY IF EXISTS "Anon can view turma_members count for public communities" ON public.turma_members;
CREATE POLICY "Anon can view turma_members count for public communities"
ON public.turma_members FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_members.turma_id
      AND t.share_slug IS NOT NULL
  )
);