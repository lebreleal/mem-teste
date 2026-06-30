CREATE OR REPLACE FUNCTION public.count_questions_by_deck_ids(p_deck_ids uuid[])
RETURNS TABLE(deck_id uuid, total bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT dq.deck_id, COUNT(*)::bigint AS total
  FROM public.deck_questions dq
  WHERE dq.deck_id = ANY(p_deck_ids)
  GROUP BY dq.deck_id;
$function$;

GRANT EXECUTE ON FUNCTION public.count_questions_by_deck_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_questions_by_deck_ids(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.count_questions_by_deck_ids(uuid[]) TO service_role;