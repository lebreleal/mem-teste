
CREATE OR REPLACE FUNCTION public.delete_subject_cascade(p_subject_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  _turma_id uuid;
  _user_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Get turma_id and verify admin
  SELECT turma_id INTO _turma_id FROM turma_subjects WHERE id = p_subject_id;
  IF _turma_id IS NULL THEN RAISE EXCEPTION 'Subject not found'; END IF;
  IF get_turma_role(_user_id, _turma_id) != 'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Recursively delete child subjects
  FOR r IN SELECT id FROM turma_subjects WHERE parent_id = p_subject_id LOOP
    PERFORM delete_subject_cascade(r.id);
  END LOOP;

  -- Delete lesson_content_folders for lessons in this subject
  DELETE FROM lesson_content_folders WHERE lesson_id IN (
    SELECT id FROM turma_lessons WHERE subject_id = p_subject_id AND turma_id = _turma_id
  );

  -- Delete lesson files
  DELETE FROM turma_lesson_files WHERE lesson_id IN (
    SELECT id FROM turma_lessons WHERE subject_id = p_subject_id AND turma_id = _turma_id
  );

  -- Delete turma_decks referencing this subject
  DELETE FROM turma_decks WHERE subject_id = p_subject_id AND turma_id = _turma_id;

  -- Delete turma exam answers/attempts/questions/exams
  DELETE FROM turma_exam_answers WHERE attempt_id IN (
    SELECT a.id FROM turma_exam_attempts a
    JOIN turma_exams e ON e.id = a.exam_id
    WHERE e.subject_id = p_subject_id AND e.turma_id = _turma_id
  );
  DELETE FROM turma_exam_attempts WHERE exam_id IN (
    SELECT id FROM turma_exams WHERE subject_id = p_subject_id AND turma_id = _turma_id
  );
  DELETE FROM turma_exam_questions WHERE exam_id IN (
    SELECT id FROM turma_exams WHERE subject_id = p_subject_id AND turma_id = _turma_id
  );
  DELETE FROM turma_exams WHERE subject_id = p_subject_id AND turma_id = _turma_id;

  -- Delete lessons
  DELETE FROM turma_lessons WHERE subject_id = p_subject_id AND turma_id = _turma_id;

  -- Delete the subject itself
  DELETE FROM turma_subjects WHERE id = p_subject_id;
END;
$function$;
