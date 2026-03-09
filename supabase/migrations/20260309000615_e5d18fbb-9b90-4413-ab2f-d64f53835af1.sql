
DROP FUNCTION IF EXISTS public.get_user_real_study_metrics(uuid);

CREATE OR REPLACE FUNCTION public.get_user_real_study_metrics(p_user_id uuid)
RETURNS TABLE(
  avg_new_seconds numeric,
  avg_learning_seconds numeric,
  avg_review_seconds numeric,
  avg_relearning_seconds numeric,
  actual_daily_minutes numeric,
  total_reviews_90d integer,
  avg_reviews_per_new_card numeric,
  avg_lapse_rate numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_ms numeric;
  v_learning_ms numeric;
  v_review_ms numeric;
  v_relearning_ms numeric;
  v_active_days integer;
  v_total_ms_30d numeric;
  v_reviews_90d integer;
  v_avg_reviews_per_new numeric;
  v_lapse_rate numeric;
BEGIN
  SELECT 
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) FILTER (WHERE state = 0),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) FILTER (WHERE state = 1),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) FILTER (WHERE state = 2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY elapsed_ms) FILTER (WHERE state = 3)
  INTO v_new_ms, v_learning_ms, v_review_ms, v_relearning_ms
  FROM review_logs
  WHERE user_id = p_user_id
    AND reviewed_at > now() - interval '30 days'
    AND elapsed_ms >= 1500 
    AND elapsed_ms <= 120000;

  avg_new_seconds := COALESCE(v_new_ms / 1000.0, 45.0);
  avg_learning_seconds := COALESCE(v_learning_ms / 1000.0, 25.0);
  avg_review_seconds := COALESCE(v_review_ms / 1000.0, 15.0);
  avg_relearning_seconds := COALESCE(v_relearning_ms / 1000.0, 25.0);

  SELECT 
    COUNT(DISTINCT date(reviewed_at AT TIME ZONE 'UTC')),
    SUM(elapsed_ms)
  INTO v_active_days, v_total_ms_30d
  FROM review_logs
  WHERE user_id = p_user_id
    AND reviewed_at > now() - interval '30 days'
    AND elapsed_ms >= 1500 
    AND elapsed_ms <= 120000;

  IF v_active_days > 0 THEN
    actual_daily_minutes := COALESCE((v_total_ms_30d / 1000.0 / 60.0) / v_active_days, 15.0);
  ELSE
    actual_daily_minutes := 15.0;
  END IF;

  SELECT count(*) INTO v_reviews_90d
  FROM review_logs
  WHERE user_id = p_user_id AND reviewed_at > now() - interval '90 days';
  total_reviews_90d := COALESCE(v_reviews_90d, 0);

  -- AVG reviews per new card on first day
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY review_count)
  INTO v_avg_reviews_per_new
  FROM (
    SELECT rl.card_id, date(rl.reviewed_at AT TIME ZONE 'UTC') as review_day, COUNT(*) as review_count
    FROM review_logs rl
    WHERE rl.user_id = p_user_id
      AND rl.reviewed_at > now() - interval '30 days'
      AND EXISTS (
        SELECT 1 FROM review_logs r2
        WHERE r2.card_id = rl.card_id AND r2.user_id = p_user_id AND r2.state = 0
          AND date(r2.reviewed_at AT TIME ZONE 'UTC') = date(rl.reviewed_at AT TIME ZONE 'UTC')
      )
    GROUP BY rl.card_id, date(rl.reviewed_at AT TIME ZONE 'UTC')
  ) sub;
  avg_reviews_per_new_card := COALESCE(v_avg_reviews_per_new, 3.0);

  -- Lapse rate: % of review cards (state=2) that got rating=1
  SELECT COUNT(*) FILTER (WHERE rating = 1)::numeric / NULLIF(COUNT(*), 0)
  INTO v_lapse_rate
  FROM review_logs
  WHERE user_id = p_user_id AND state = 2 AND reviewed_at > now() - interval '30 days';
  avg_lapse_rate := COALESCE(v_lapse_rate, 0.10);

  RETURN NEXT;
END;
$$;
