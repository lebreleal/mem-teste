ALTER TABLE public.ai_token_usage
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openrouter',
  ADD COLUMN IF NOT EXISTS generation_id text;

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_created_at ON public.ai_token_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_created ON public.ai_token_usage (user_id, created_at DESC);

DROP FUNCTION IF EXISTS public.admin_get_global_token_usage(uuid, timestamptz, timestamptz, integer);

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
  provider text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  energy_cost integer,
  cost_usd numeric
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
  SELECT t.id, t.created_at, t.user_id, p.name, p.email, t.feature_key, t.model, t.provider,
         t.prompt_tokens, t.completion_tokens, t.total_tokens, t.energy_cost, t.cost_usd
  FROM public.ai_token_usage t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE (p_user_id IS NULL OR t.user_id = p_user_id)
    AND (p_date_from IS NULL OR t.created_at >= p_date_from)
    AND (p_date_to IS NULL OR t.created_at <= p_date_to)
  ORDER BY t.created_at DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ai_cost_by_user(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  user_email text,
  calls bigint,
  total_tokens bigint,
  energy_cost bigint,
  cost_usd numeric,
  last_used_at timestamptz
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
  SELECT t.user_id, p.name, p.email, count(*)::bigint,
         COALESCE(sum(t.total_tokens),0)::bigint,
         COALESCE(sum(t.energy_cost),0)::bigint,
         COALESCE(sum(t.cost_usd),0)::numeric,
         max(t.created_at)
  FROM public.ai_token_usage t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE (p_date_from IS NULL OR t.created_at >= p_date_from)
    AND (p_date_to IS NULL OR t.created_at <= p_date_to)
  GROUP BY t.user_id, p.name, p.email
  ORDER BY COALESCE(sum(t.cost_usd),0) DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_ai_cost_breakdown(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  dimension text,
  label text,
  calls bigint,
  total_tokens bigint,
  cost_usd numeric
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
  SELECT 'model'::text, t.model, count(*)::bigint,
         COALESCE(sum(t.total_tokens),0)::bigint, COALESCE(sum(t.cost_usd),0)::numeric
  FROM public.ai_token_usage t
  WHERE (p_date_from IS NULL OR t.created_at >= p_date_from)
    AND (p_date_to IS NULL OR t.created_at <= p_date_to)
  GROUP BY t.model
  UNION ALL
  SELECT 'feature'::text, t.feature_key, count(*)::bigint,
         COALESCE(sum(t.total_tokens),0)::bigint, COALESCE(sum(t.cost_usd),0)::numeric
  FROM public.ai_token_usage t
  WHERE (p_date_from IS NULL OR t.created_at >= p_date_from)
    AND (p_date_to IS NULL OR t.created_at <= p_date_to)
  GROUP BY t.feature_key
  UNION ALL
  SELECT 'day'::text, to_char(date_trunc('day', t.created_at), 'YYYY-MM-DD'), count(*)::bigint,
         COALESCE(sum(t.total_tokens),0)::bigint, COALESCE(sum(t.cost_usd),0)::numeric
  FROM public.ai_token_usage t
  WHERE (p_date_from IS NULL OR t.created_at >= p_date_from)
    AND (p_date_to IS NULL OR t.created_at <= p_date_to)
  GROUP BY date_trunc('day', t.created_at)
  ORDER BY 1, 5 DESC;
END;
$$;