
-- Allow anon to read turma_decks for public communities (those with share_slug)
CREATE POLICY "Anon can view published turma_decks for public communities"
ON turma_decks FOR SELECT
TO anon
USING (
  is_published = true
  AND EXISTS (
    SELECT 1 FROM turmas t WHERE t.id = turma_decks.turma_id AND t.share_slug IS NOT NULL
  )
);

-- Allow anon to read turma_subjects for public communities
CREATE POLICY "Anon can view turma_subjects for public communities"
ON turma_subjects FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t WHERE t.id = turma_subjects.turma_id AND t.share_slug IS NOT NULL
  )
);

-- Allow anon to read profiles for public display
CREATE POLICY "Anon can view public profiles"
ON profiles FOR SELECT
TO anon
USING (is_profile_public = true);

-- Allow anon to read turma_members count for public communities
CREATE POLICY "Anon can view turma_members for public communities"
ON turma_members FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t WHERE t.id = turma_members.turma_id AND t.share_slug IS NOT NULL
  )
);
