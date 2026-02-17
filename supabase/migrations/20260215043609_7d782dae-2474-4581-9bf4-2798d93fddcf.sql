
-- Add energy_cost column to ai_token_usage
ALTER TABLE public.ai_token_usage ADD COLUMN IF NOT EXISTS energy_cost integer NOT NULL DEFAULT 0;

-- Recreate the RPC function with the energy_cost column
CREATE OR REPLACE FUNCTION public.admin_get_user_token_usage(p_user_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(feature_key text, model text, total_calls bigint, total_prompt_tokens bigint, total_completion_tokens bigint, total_tokens_sum bigint, total_energy_cost bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT t.feature_key, t.model,
         COUNT(*) as total_calls,
         SUM(t.prompt_tokens)::bigint as total_prompt_tokens,
         SUM(t.completion_tokens)::bigint as total_completion_tokens,
         SUM(t.total_tokens)::bigint as total_tokens_sum,
         SUM(t.energy_cost)::bigint as total_energy_cost
  FROM ai_token_usage t
  WHERE t.user_id = p_user_id
    AND t.created_at >= now() - (p_days || ' days')::interval
  GROUP BY t.feature_key, t.model
  ORDER BY total_tokens_sum DESC;
END;
$function$;
