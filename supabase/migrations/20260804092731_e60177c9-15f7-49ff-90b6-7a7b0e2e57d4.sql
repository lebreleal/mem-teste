CREATE OR REPLACE FUNCTION public.reorder_folders(p_ordered_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.folders f
  SET sort_order = o.ord - 1
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, ord)
  WHERE f.id = o.id AND f.user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.reorder_turma_lesson_files(p_ordered_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  UPDATE public.turma_lesson_files t
  SET sort_order = o.ord - 1
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, ord)
  WHERE t.id = o.id;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_turma_exams(p_ordered_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  UPDATE public.turma_exams t
  SET sort_order = o.ord - 1
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS o(id, ord)
  WHERE t.id = o.id;
$function$;

REVOKE EXECUTE ON FUNCTION public.reorder_folders(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reorder_turma_lesson_files(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reorder_turma_exams(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_folders(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_turma_lesson_files(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_turma_exams(uuid[]) TO authenticated;