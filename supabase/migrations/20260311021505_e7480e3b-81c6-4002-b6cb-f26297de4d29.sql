-- Allow authenticated non-members to view turma_decks from public communities
CREATE POLICY "Authenticated can view published turma_decks for public communities"
ON turma_decks FOR SELECT TO authenticated
USING (
  is_published = true
  AND EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_decks.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated non-members to view turma_subjects from public communities
CREATE POLICY "Authenticated can view turma_subjects for public communities"
ON turma_subjects FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_subjects.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated non-members to view turma_members from public communities
CREATE POLICY "Authenticated can view turma_members for public communities"
ON turma_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_members.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated non-members to view turma_lessons from public communities
CREATE POLICY "Authenticated can view turma_lessons for public communities"
ON turma_lessons FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_lessons.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated non-members to view turma_exams from public communities
CREATE POLICY "Authenticated can view turma_exams for public communities"
ON turma_exams FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_exams.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated non-members to view lesson_content_folders from public communities
CREATE POLICY "Authenticated can view lesson_content_folders for public communities"
ON lesson_content_folders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = lesson_content_folders.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);

-- Allow authenticated non-members to view turma_lesson_files from public communities
CREATE POLICY "Authenticated can view turma_lesson_files for public communities"
ON turma_lesson_files FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = turma_lesson_files.turma_id
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  )
);