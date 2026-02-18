-- Cascade delete for turma exams (handles FK constraints)
CREATE OR REPLACE FUNCTION public.delete_turma_exam_cascade(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _turma_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Get turma_id and verify permission
  SELECT turma_id INTO _turma_id FROM turma_exams WHERE id = p_exam_id;
  IF _turma_id IS NULL THEN RAISE EXCEPTION 'Exam not found'; END IF;
  
  -- Check if user is creator or admin
  IF NOT EXISTS (
    SELECT 1 FROM turma_exams 
    WHERE id = p_exam_id 
    AND (created_by = _user_id OR get_turma_role(_user_id, _turma_id) = 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Delete answers first
  DELETE FROM turma_exam_answers WHERE attempt_id IN (
    SELECT id FROM turma_exam_attempts WHERE exam_id = p_exam_id
  );
  
  -- Delete attempts
  DELETE FROM turma_exam_attempts WHERE exam_id = p_exam_id;
  
  -- Delete questions
  DELETE FROM turma_exam_questions WHERE exam_id = p_exam_id;
  
  -- Delete the exam
  DELETE FROM turma_exams WHERE id = p_exam_id;
END;
$$;

-- Also create cascade delete for lesson files (handles storage cleanup)
CREATE OR REPLACE FUNCTION public.delete_lesson_cascade(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _turma_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT turma_id INTO _turma_id FROM turma_lessons WHERE id = p_lesson_id;
  IF _turma_id IS NULL THEN RAISE EXCEPTION 'Lesson not found'; END IF;

  IF NOT (
    (SELECT created_by FROM turma_lessons WHERE id = p_lesson_id) = _user_id
    OR get_turma_role(_user_id, _turma_id) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Delete content folders
  DELETE FROM lesson_content_folders WHERE lesson_id = p_lesson_id;
  
  -- Delete files
  DELETE FROM turma_lesson_files WHERE lesson_id = p_lesson_id;
  
  -- Delete decks referencing this lesson
  DELETE FROM turma_decks WHERE lesson_id = p_lesson_id;
  
  -- Delete exams referencing this lesson
  DELETE FROM turma_exam_answers WHERE attempt_id IN (
    SELECT a.id FROM turma_exam_attempts a
    JOIN turma_exams e ON e.id = a.exam_id
    WHERE e.lesson_id = p_lesson_id
  );
  DELETE FROM turma_exam_attempts WHERE exam_id IN (
    SELECT id FROM turma_exams WHERE lesson_id = p_lesson_id
  );
  DELETE FROM turma_exam_questions WHERE exam_id IN (
    SELECT id FROM turma_exams WHERE lesson_id = p_lesson_id
  );
  DELETE FROM turma_exams WHERE lesson_id = p_lesson_id;
  
  -- Delete the lesson
  DELETE FROM turma_lessons WHERE id = p_lesson_id;
END;
$$;