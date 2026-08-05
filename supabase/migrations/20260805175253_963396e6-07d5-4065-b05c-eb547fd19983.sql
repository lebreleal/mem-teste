CREATE OR REPLACE FUNCTION public.leave_turma(_turma_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _user_role turma_role;
  _is_owner boolean;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO _user_role FROM turma_members WHERE turma_id = _turma_id AND user_id = _user_id;
  IF _user_role IS NULL THEN RAISE EXCEPTION 'Not a member'; END IF;

  SELECT (owner_id = _user_id) INTO _is_owner FROM turmas WHERE id = _turma_id;

  IF _is_owner THEN
    DELETE FROM lesson_content_folders WHERE turma_id = _turma_id;
    DELETE FROM turma_lesson_files WHERE turma_id = _turma_id;
    DELETE FROM turma_decks WHERE turma_id = _turma_id;
    DELETE FROM turma_exam_answers WHERE attempt_id IN (
      SELECT a.id FROM turma_exam_attempts a JOIN turma_exams e ON e.id = a.exam_id WHERE e.turma_id = _turma_id
    );
    DELETE FROM turma_exam_attempts WHERE exam_id IN (SELECT id FROM turma_exams WHERE turma_id = _turma_id);
    DELETE FROM turma_exam_questions WHERE exam_id IN (SELECT id FROM turma_exams WHERE turma_id = _turma_id);
    DELETE FROM turma_exams WHERE turma_id = _turma_id;
    DELETE FROM turma_questions WHERE turma_id = _turma_id;
    DELETE FROM turma_lessons WHERE turma_id = _turma_id;
    DELETE FROM turma_subjects WHERE turma_id = _turma_id;
    DELETE FROM turma_semesters WHERE turma_id = _turma_id;
    DELETE FROM turma_ratings WHERE turma_id = _turma_id;
    DELETE FROM turma_subscriptions WHERE turma_id = _turma_id;
    DELETE FROM turma_permissions WHERE turma_id = _turma_id;
    DELETE FROM turma_members WHERE turma_id = _turma_id;
    DELETE FROM turmas WHERE id = _turma_id;
    RETURN;
  END IF;

  WITH RECURSIVE roots AS (
    SELECT d.id FROM decks d
    WHERE d.user_id = _user_id
      AND (d.community_id = _turma_id
           OR d.source_turma_deck_id IN (SELECT id FROM turma_decks WHERE turma_id = _turma_id))
  ), tree AS (
    SELECT id FROM roots
    UNION ALL
    SELECT d.id FROM decks d JOIN tree ON d.parent_deck_id = tree.id WHERE d.user_id = _user_id
  )
  UPDATE decks SET is_archived = true, updated_at = now()
  WHERE id IN (SELECT id FROM tree) AND is_archived = false;

  UPDATE folders SET is_archived = true, updated_at = now()
  WHERE user_id = _user_id AND source_turma_id = _turma_id AND is_archived = false;

  DELETE FROM turma_members WHERE turma_id = _turma_id AND user_id = _user_id;
END;
$function$;

WITH RECURSIVE orphan AS (
  SELECT d.id
  FROM decks d
  JOIN turma_decks td ON td.id = d.source_turma_deck_id
  WHERE d.is_archived = false
    AND NOT EXISTS (
      SELECT 1 FROM turma_members m WHERE m.turma_id = td.turma_id AND m.user_id = d.user_id
    )
), tree AS (
  SELECT id FROM orphan
  UNION ALL
  SELECT d.id FROM decks d JOIN tree ON d.parent_deck_id = tree.id
)
UPDATE decks SET is_archived = true WHERE id IN (SELECT id FROM tree) AND is_archived = false;