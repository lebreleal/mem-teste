-- Simpler approach: update the ranking RPC to use a simple streak calculation
CREATE OR REPLACE FUNCTION public.get_user_ranking()
 RETURNS TABLE(user_id uuid, user_name text, cards_30d bigint, minutes_30d bigint, current_streak integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      p.id AS user_id,
      p.name AS user_name,
      COALESCE(r.cards_30d, 0) AS cards_30d,
      COALESCE(r.minutes_30d, 0) AS minutes_30d
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
  ),
  streaks AS (
    SELECT
      b.user_id,
      b.user_name,
      b.cards_30d,
      b.minutes_30d,
      (
        SELECT COUNT(*)::integer
        FROM (
          SELECT DISTINCT (rl.reviewed_at::date) AS d
          FROM review_logs rl
          WHERE rl.user_id = b.user_id
            AND rl.reviewed_at >= now() - interval '60 days'
        ) days
        WHERE days.d >= (
          -- Find the first gap going backwards from today
          SELECT COALESCE(
            (SELECT (g.d + interval '1 day')::date
             FROM generate_series(0, 59) AS i(n)
             CROSS JOIN LATERAL (SELECT (current_date - i.n) AS d) g
             WHERE NOT EXISTS (
               SELECT 1 FROM review_logs rl2
               WHERE rl2.user_id = b.user_id
                 AND rl2.reviewed_at::date = g.d
             )
             -- Allow today to be a gap (user hasn't studied yet today)
             AND g.d < current_date
             ORDER BY g.d DESC
             LIMIT 1),
            current_date - 59
          )
        )
      ) AS current_streak
    FROM base b
  )
  SELECT s.user_id, s.user_name, s.cards_30d, s.minutes_30d, s.current_streak
  FROM streaks s
  ORDER BY s.cards_30d DESC NULLS LAST
  LIMIT 50;
$function$;