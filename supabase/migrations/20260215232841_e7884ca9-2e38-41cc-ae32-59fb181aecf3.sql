
CREATE OR REPLACE FUNCTION public.get_community_preview_stats(p_turma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_private boolean;
  v_subjects jsonb;
BEGIN
  SELECT is_private INTO v_is_private FROM turmas WHERE id = p_turma_id;
  IF v_is_private AND NOT is_turma_member(auth.uid(), p_turma_id) THEN
    RETURN jsonb_build_object('subjects', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(sub ORDER BY sub.sort_order), '[]'::jsonb)
  INTO v_subjects
  FROM (
    SELECT 
      s.id,
      s.name,
      s.sort_order,
      (SELECT COUNT(*) FROM turma_lessons l WHERE l.subject_id = s.id AND l.is_published = true) AS "lessonCount",
      (SELECT COALESCE(COUNT(*), 0) FROM cards c JOIN turma_decks td ON td.deck_id = c.deck_id WHERE td.subject_id = s.id AND td.turma_id = p_turma_id) AS "cardCount",
      (SELECT COALESCE(COUNT(*), 0) FROM turma_lesson_files f JOIN turma_lessons l2 ON l2.id = f.lesson_id WHERE l2.subject_id = s.id AND f.turma_id = p_turma_id) AS "fileCount"
    FROM turma_subjects s
    WHERE s.turma_id = p_turma_id
  ) sub;

  RETURN jsonb_build_object('subjects', v_subjects);
END;
$$;
