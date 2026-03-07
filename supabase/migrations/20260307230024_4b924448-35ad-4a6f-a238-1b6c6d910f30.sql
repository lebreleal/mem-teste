
CREATE OR REPLACE FUNCTION public.admin_get_global_token_usage(
  p_user_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  user_email text,
  feature_key text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  energy_cost integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.created_at,
    t.user_id,
    p.name AS user_name,
    p.email AS user_email,
    t.feature_key,
    t.model,
    t.prompt_tokens,
    t.completion_tokens,
    t.total_tokens,
    t.energy_cost
  FROM ai_token_usage t
  LEFT JOIN profiles p ON p.id = t.user_id
  WHERE (p_user_id IS NULL OR t.user_id = p_user_id)
    AND (p_date_from IS NULL OR t.created_at >= p_date_from)
    AND (p_date_to IS NULL OR t.created_at <= p_date_to)
  ORDER BY t.created_at DESC
  LIMIT p_limit;
END;
$$;
