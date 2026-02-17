
CREATE OR REPLACE FUNCTION public.leave_turma(_turma_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Count other members
  SELECT COUNT(*) INTO _member_count
  FROM turma_members
  WHERE turma_id = _turma_id AND user_id != _user_id;

  IF _member_count = 0 THEN
    -- Last member: delete turma entirely
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
    DELETE FROM turma_permissions WHERE turma_id = _turma_id;
    DELETE FROM turma_members WHERE turma_id = _turma_id;
    DELETE FROM turmas WHERE id = _turma_id;
    RETURN;
  END IF;

  -- If owner or admin, transfer ownership
  IF _is_owner OR _user_role = 'admin' THEN
    -- Try to find another admin first
    SELECT user_id INTO _new_admin_id
    FROM turma_members
    WHERE turma_id = _turma_id AND user_id != _user_id AND role = 'admin'
    LIMIT 1;

    -- Then try moderator
    IF _new_admin_id IS NULL THEN
      SELECT user_id INTO _new_admin_id
      FROM turma_members
      WHERE turma_id = _turma_id AND user_id != _user_id AND role = 'moderator'
      LIMIT 1;
    END IF;

    -- Then any member
    IF _new_admin_id IS NULL THEN
      SELECT user_id INTO _new_admin_id
      FROM turma_members
      WHERE turma_id = _turma_id AND user_id != _user_id
      LIMIT 1;
    END IF;

    -- Promote to admin
    UPDATE turma_members SET role = 'admin'
    WHERE turma_id = _turma_id AND user_id = _new_admin_id;

    -- Transfer ownership
    IF _is_owner THEN
      UPDATE turmas SET owner_id = _new_admin_id WHERE id = _turma_id;
    END IF;
  END IF;

  -- Remove member
  DELETE FROM turma_members
  WHERE turma_id = _turma_id AND user_id = _user_id;
END;
$$;
