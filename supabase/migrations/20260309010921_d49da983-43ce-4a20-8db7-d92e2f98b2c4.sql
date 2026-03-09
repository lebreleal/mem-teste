
CREATE OR REPLACE FUNCTION public.get_user_ranking()
RETURNS TABLE (
  user_id uuid,
  user_name text,
  cards_30d bigint,
  minutes_30d bigint,
  current_streak integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.name AS user_name,
    COALESCE(r.cards_30d, 0) AS cards_30d,
    COALESCE(r.minutes_30d, 0) AS minutes_30d,
    p.current_streak
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS cards_30d,
      (COALESCE(SUM(LEAST(GREATEST(rl.elapsed_ms, 1500), 120000)), 0) / 60000)::bigint AS minutes_30d
    FROM review_logs rl
    WHERE rl.user_id = p.id
      AND rl.reviewed_at >= NOW() - INTERVAL '30 days'
  ) r ON true
  WHERE p.is_profile_public = true
  ORDER BY r.cards_30d DESC NULLS LAST
  LIMIT 50;
$$;
