
CREATE OR REPLACE FUNCTION public.get_study_queue_limits(
  p_user_id uuid,
  p_card_ids uuid[],
  p_tz_offset_minutes integer DEFAULT 0
)
RETURNS TABLE(new_reviewed_today bigint, review_reviewed_today bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH user_today AS (
    SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
  ),
  today_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM review_logs rl, user_today ut
    WHERE rl.card_id = ANY(p_card_ids)
      AND rl.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut.today_date
  ),
  prior_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM review_logs rl, user_today ut
    WHERE rl.card_id = ANY(p_card_ids)
      AND rl.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date < ut.today_date
  )
  SELECT
    COUNT(*) FILTER (WHERE tr.card_id IS NOT NULL AND pr.card_id IS NULL) AS new_reviewed_today,
    COUNT(*) FILTER (WHERE tr.card_id IS NOT NULL AND pr.card_id IS NOT NULL) AS review_reviewed_today
  FROM today_reviewed tr
  LEFT JOIN prior_reviewed pr ON pr.card_id = tr.card_id;
$$;
