
-- Create RPC to return full community preview data for non-members
CREATE OR REPLACE FUNCTION public.get_community_full_preview(p_turma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_turma RECORD;
  v_subjects jsonb;
  v_lessons jsonb;
  v_exams jsonb;
  v_members jsonb;
  v_member_count integer;
BEGIN
  SELECT * INTO v_turma FROM turmas WHERE id = p_turma_id;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;

  -- If private and not a member, return limited data
  IF v_turma.is_private AND NOT is_turma_member(auth.uid(), p_turma_id) THEN
    RETURN jsonb_build_object('restricted', true);
  END IF;

  -- Subjects
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'parent_id', s.parent_id, 'sort_order', s.sort_order
  ) ORDER BY s.sort_order), '[]'::jsonb)
  INTO v_subjects
  FROM turma_subjects s WHERE s.turma_id = p_turma_id;

  -- Published lessons
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', l.name, 'subject_id', l.subject_id, 
    'lesson_date', l.lesson_date, 'sort_order', l.sort_order
  ) ORDER BY l.sort_order), '[]'::jsonb)
  INTO v_lessons
  FROM turma_lessons l WHERE l.turma_id = p_turma_id AND l.is_published = true;

  -- Published exams
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'subject_id', e.subject_id,
    'total_questions', e.total_questions, 'time_limit_seconds', e.time_limit_seconds
  ) ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_exams
  FROM turma_exams e WHERE e.turma_id = p_turma_id AND e.is_published = true;

  -- Members (just names + roles, limited to 20)
  SELECT COUNT(*) INTO v_member_count FROM turma_members WHERE turma_id = p_turma_id;
  
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', p.name, 'role', m.role
  ) ORDER BY m.role, m.joined_at), '[]'::jsonb)
  INTO v_members
  FROM (SELECT * FROM turma_members WHERE turma_id = p_turma_id ORDER BY role, joined_at LIMIT 20) m
  JOIN profiles p ON p.id = m.user_id;

  RETURN jsonb_build_object(
    'subjects', v_subjects,
    'lessons', v_lessons,
    'exams', v_exams,
    'members', v_members,
    'member_count', v_member_count
  );
END;
$function$;
