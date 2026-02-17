
CREATE OR REPLACE FUNCTION public.admin_get_user_token_usage_detailed(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  id uuid,
  created_at timestamp with time zone,
  feature_key text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  energy_cost integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.created_at,
    t.feature_key,
    t.model,
    t.prompt_tokens,
    t.completion_tokens,
    t.total_tokens,
    t.energy_cost
  FROM ai_token_usage t
  WHERE t.user_id = p_user_id
    AND t.created_at >= now() - (p_days || ' days')::interval
  ORDER BY t.created_at DESC;
END;
$function$;
