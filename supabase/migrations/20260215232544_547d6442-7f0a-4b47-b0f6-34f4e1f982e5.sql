
CREATE OR REPLACE FUNCTION public.get_community_preview_stats(p_turma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_private boolean;
  v_subject_count int;
  v_lesson_count int;
  v_deck_count int;
  v_exam_count int;
  v_file_count int;
  v_total_cards int;
  v_basic int;
  v_cloze int;
  v_question int;
  v_subjects jsonb;
BEGIN
  -- Check if turma is public or user is member
  SELECT is_private INTO v_is_private FROM turmas WHERE id = p_turma_id;
  IF v_is_private AND NOT is_turma_member(auth.uid(), p_turma_id) THEN
    RETURN jsonb_build_object('subjectCount', 0, 'lessonCount', 0, 'deckCount', 0, 'examCount', 0, 'totalCards', 0, 'fileCount', 0, 'cardTypes', jsonb_build_object('basic', 0, 'cloze', 0, 'question', 0), 'subjects', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO v_subject_count FROM turma_subjects WHERE turma_id = p_turma_id;
  SELECT COUNT(*) INTO v_lesson_count FROM turma_lessons WHERE turma_id = p_turma_id AND is_published = true;
  SELECT COUNT(*) INTO v_deck_count FROM turma_decks WHERE turma_id = p_turma_id;
  SELECT COUNT(*) INTO v_exam_count FROM turma_exams WHERE turma_id = p_turma_id AND is_published = true;
  SELECT COUNT(*) INTO v_file_count FROM turma_lesson_files WHERE turma_id = p_turma_id;

  -- Card counts
  SELECT 
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE c.card_type = 'basic'), 0),
    COALESCE(COUNT(*) FILTER (WHERE c.card_type = 'cloze'), 0),
    COALESCE(COUNT(*) FILTER (WHERE c.card_type = 'question'), 0)
  INTO v_total_cards, v_basic, v_cloze, v_question
  FROM cards c
  JOIN turma_decks td ON td.deck_id = c.deck_id
  WHERE td.turma_id = p_turma_id;

  -- Subject previews
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'lessonCount', (SELECT COUNT(*) FROM turma_lessons l WHERE l.subject_id = s.id AND l.is_published = true)
  ) ORDER BY s.sort_order), '[]'::jsonb)
  INTO v_subjects
  FROM turma_subjects s WHERE s.turma_id = p_turma_id;

  RETURN jsonb_build_object(
    'subjectCount', v_subject_count,
    'lessonCount', v_lesson_count,
    'deckCount', v_deck_count,
    'examCount', v_exam_count,
    'totalCards', v_total_cards,
    'fileCount', v_file_count,
    'cardTypes', jsonb_build_object('basic', v_basic, 'cloze', v_cloze, 'question', v_question),
    'subjects', v_subjects
  );
END;
$$;
