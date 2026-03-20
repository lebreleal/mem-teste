
CREATE OR REPLACE FUNCTION public.validate_forecast_accuracy(p_user_id uuid, p_days integer DEFAULT 14)
RETURNS TABLE(
  review_date date,
  actual_new_cards bigint,
  actual_review_cards bigint,
  actual_learning_cards bigint,
  actual_relearning_cards bigint,
  actual_total_cards bigint,
  actual_total_seconds bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (rl.reviewed_at AT TIME ZONE 'UTC')::date AS review_date,
    COUNT(*) FILTER (WHERE rl.state = 0) AS actual_new_cards,
    COUNT(*) FILTER (WHERE rl.state = 2) AS actual_review_cards,
    COUNT(*) FILTER (WHERE rl.state = 1) AS actual_learning_cards,
    COUNT(*) FILTER (WHERE rl.state = 3) AS actual_relearning_cards,
    COUNT(*) AS actual_total_cards,
    COALESCE(SUM(rl.elapsed_ms) / 1000, 0) AS actual_total_seconds
  FROM review_logs rl
  WHERE rl.user_id = p_user_id
    AND rl.reviewed_at >= (now() - (p_days || ' days')::interval)
  GROUP BY (rl.reviewed_at AT TIME ZONE 'UTC')::date
  ORDER BY review_date
$$;
