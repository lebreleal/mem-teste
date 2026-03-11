
-- Allow anon to view any public community (not just ones with share_slug)
DROP POLICY IF EXISTS "Anyone can view turmas by share_slug" ON turmas;
CREATE POLICY "Anon can view public turmas"
ON turmas FOR SELECT TO anon
USING (is_private = false OR share_slug IS NOT NULL);

-- Allow anon to view turmas by ID for public communities
CREATE POLICY "Anon can view turmas by id"
ON turmas FOR SELECT TO anon
USING (is_private = false);

-- Allow anon to read decks that belong to public community turma_decks
DROP POLICY IF EXISTS "Anon can view decks for public communities" ON decks;
CREATE POLICY "Anon can view decks for public communities"
ON decks FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turma_decks td
    JOIN turmas t ON t.id = td.turma_id
    WHERE td.deck_id = decks.id
      AND td.is_published = true
      AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow anon to read cards for public community decks (for preview)
DROP POLICY IF EXISTS "Anon can view cards from public community decks" ON cards;
CREATE POLICY "Anon can view cards from public community decks"
ON cards FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turma_decks td
    JOIN turmas t ON t.id = td.turma_id
    WHERE td.deck_id = cards.deck_id
      AND td.is_published = true
      AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow anon to read any profile (just name) for display purposes
-- The existing policy requires is_profile_public which is too restrictive
DROP POLICY IF EXISTS "Anon can view public profiles" ON profiles;
CREATE POLICY "Anon can view profiles for display"
ON profiles FOR SELECT TO anon
USING (true);

-- Allow anon to view turma_lesson_files for public communities
DROP POLICY IF EXISTS "Anon can view turma_lesson_files" ON turma_lesson_files;
CREATE POLICY "Anon can view turma_lesson_files"
ON turma_lesson_files FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_id
      AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow anon to view turma_exams for public communities
DROP POLICY IF EXISTS "Anon can view turma_exams" ON turma_exams;
CREATE POLICY "Anon can view turma_exams"
ON turma_exams FOR SELECT TO anon
USING (
  is_published = true
  AND EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_id
      AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Update existing policies to also allow non-slug public communities
DROP POLICY IF EXISTS "Anon can view published turma_decks for public communities" ON turma_decks;
CREATE POLICY "Anon can view published turma_decks for public communities"
ON turma_decks FOR SELECT TO anon
USING (
  is_published = true
  AND EXISTS (
    SELECT 1 FROM turmas t WHERE t.id = turma_id AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "Anon can view turma_subjects for public communities" ON turma_subjects;
CREATE POLICY "Anon can view turma_subjects for public communities"
ON turma_subjects FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t WHERE t.id = turma_id AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

DROP POLICY IF EXISTS "Anon can view turma_members count for public communities" ON turma_members;
DROP POLICY IF EXISTS "Anon can view turma_members for public communities" ON turma_members;
CREATE POLICY "Anon can view turma_members for public communities"
ON turma_members FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM turmas t WHERE t.id = turma_id AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);
