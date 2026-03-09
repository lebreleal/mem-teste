-- Drop all overloads of get_hourly_breakdown and recreate with timezone support
DROP FUNCTION IF EXISTS public.get_hourly_breakdown(uuid, integer);
DROP FUNCTION IF EXISTS public.get_hourly_breakdown(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_hourly_breakdown(
  p_user_id uuid,
  p_tz_offset_minutes integer DEFAULT 0,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      extract(hour FROM (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval))::int AS hour,
      count(*)::int AS total,
      count(*) FILTER (WHERE rl.rating >= 3)::int AS correct
    FROM review_logs rl
    WHERE rl.user_id = p_user_id
      AND rl.reviewed_at >= (now() - (p_days || ' days')::interval)
    GROUP BY 1
    ORDER BY 1
  ) t;

  RETURN result;
END;
$$;