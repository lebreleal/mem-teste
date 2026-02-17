
CREATE OR REPLACE FUNCTION public.leave_turma(_turma_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _member_count int;
  _user_role turma_role;
  _is_owner boolean;
  _new_admin_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check membership
  SELECT role INTO _user_role
  FROM turma_members
  WHERE turma_id = _turma_id AND user_id = _user_id;

  IF _user_role IS NULL THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  -- Check if owner
  SELECT (owner_id = _user_id) INTO _is_owner
  FROM turmas WHERE id = _turma_id;

  -- If owner leaves, DELETE the entire community
  IF _is_owner THEN
    DELETE FROM turma_lesson_files WHERE turma_id = _turma_id;
    DELETE FROM turma_decks WHERE turma_id = _turma_id;
    DELETE FROM turma_exam_answers WHERE attempt_id IN (
      SELECT a.id FROM turma_exam_attempts a
      JOIN turma_exams e ON e.id = a.exam_id
      WHERE e.turma_id = _turma_id
    );
    DELETE FROM turma_exam_attempts WHERE exam_id IN (
      SELECT id FROM turma_exams WHERE turma_id = _turma_id
    );
    DELETE FROM turma_exam_questions WHERE exam_id IN (
      SELECT id FROM turma_exams WHERE turma_id = _turma_id
    );
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

  -- Non-owner: just remove membership
  DELETE FROM turma_members
  WHERE turma_id = _turma_id AND user_id = _user_id;
END;
$function$;
