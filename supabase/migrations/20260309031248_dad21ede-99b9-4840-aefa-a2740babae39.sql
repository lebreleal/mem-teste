
-- RPC: get_hourly_breakdown — returns review volume and success rate by hour of day
CREATE OR REPLACE FUNCTION public.get_hourly_breakdown(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.hour)
  INTO v_result
  FROM (
    SELECT
      EXTRACT(HOUR FROM rl.reviewed_at AT TIME ZONE 'UTC')::int AS hour,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE rl.rating >= 2)::int AS correct,
      CASE WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE rl.rating >= 2)::numeric / COUNT(*)) * 100, 1)
        ELSE 0
      END AS success_rate
    FROM review_logs rl
    WHERE rl.user_id = p_user_id
      AND rl.reviewed_at >= NOW() - (p_days || ' days')::interval
    GROUP BY EXTRACT(HOUR FROM rl.reviewed_at AT TIME ZONE 'UTC')
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
