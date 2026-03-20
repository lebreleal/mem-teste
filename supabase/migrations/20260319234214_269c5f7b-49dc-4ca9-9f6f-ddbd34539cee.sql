
CREATE OR REPLACE FUNCTION public.get_user_time_calibration(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_factor numeric;
  v_global_factor numeric;
  v_total_sessions integer;
BEGIN
  WITH user_medians AS (
    SELECT
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 0), 30) AS med_new,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 1), 15) AS med_learning,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 2), 8)  AS med_review,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 3), 12) AS med_relearning
    FROM (
      SELECT
        LEAST(60, GREATEST(1, EXTRACT(EPOCH FROM (rl.reviewed_at -
          LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at)
        )))) AS dur,
        COALESCE(rl.state, 0) AS pre_state
      FROM review_logs rl
      WHERE rl.user_id = p_user_id
        AND rl.reviewed_at > now() - interval '30 days'
    ) gaps
    WHERE dur IS NOT NULL AND dur <= 300
  ),
  daily_data AS (
    SELECT
      (rl.reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date AS study_day,
      SUM(LEAST(GREATEST(COALESCE(rl.elapsed_ms, 15000), 1500), 120000)) / 1000.0 AS real_seconds,
      SUM(
        CASE COALESCE(rl.state, 0)
          WHEN 0 THEN um.med_new
          WHEN 1 THEN um.med_learning
          WHEN 2 THEN um.med_review
          WHEN 3 THEN um.med_relearning
          ELSE um.med_review
        END
      ) AS estimated_seconds,
      COUNT(*) AS interactions
    FROM review_logs rl
    CROSS JOIN user_medians um
    WHERE rl.user_id = p_user_id
      AND rl.reviewed_at > now() - interval '30 days'
    GROUP BY (rl.reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date
    HAVING COUNT(*) >= 5
  ),
  ratios AS (
    SELECT
      study_day,
      CASE WHEN estimated_seconds > 0
        THEN real_seconds / estimated_seconds
        ELSE 1.20
      END AS ratio
    FROM daily_data
    ORDER BY study_day DESC
    LIMIT 14
  )
  SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ratio),
    COUNT(*)
  INTO v_user_factor, v_total_sessions
  FROM ratios;

  IF v_total_sessions >= 5 AND v_user_factor IS NOT NULL AND v_user_factor > 0 THEN
    v_user_factor := LEAST(2.0, GREATEST(0.8, v_user_factor));
    RETURN jsonb_build_object(
      'calibration_factor', ROUND(v_user_factor, 3),
      'sessions_used', v_total_sessions,
      'source', 'individual'
    );
  END IF;

  WITH top_users AS (
    SELECT user_id
    FROM review_logs
    WHERE reviewed_at > now() - interval '14 days'
    GROUP BY user_id
    HAVING COUNT(*) >= 50
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ),
  global_medians AS (
    SELECT tu.user_id,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 0), 30) AS med_new,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 1), 15) AS med_learning,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 2), 8)  AS med_review,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 3), 12) AS med_relearning
    FROM top_users tu
    CROSS JOIN LATERAL (
      SELECT
        LEAST(60, GREATEST(1, EXTRACT(EPOCH FROM (rl.reviewed_at -
          LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at)
        )))) AS dur,
        COALESCE(rl.state, 0) AS pre_state
      FROM review_logs rl
      WHERE rl.user_id = tu.user_id
        AND rl.reviewed_at > now() - interval '30 days'
    ) gaps
    WHERE dur IS NOT NULL AND dur <= 300
    GROUP BY tu.user_id
  ),
  global_daily AS (
    SELECT
      rl.user_id,
      (rl.reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date AS study_day,
      SUM(LEAST(GREATEST(COALESCE(rl.elapsed_ms, 15000), 1500), 120000)) / 1000.0 AS real_seconds,
      SUM(
        CASE COALESCE(rl.state, 0)
          WHEN 0 THEN gm.med_new
          WHEN 1 THEN gm.med_learning
          WHEN 2 THEN gm.med_review
          WHEN 3 THEN gm.med_relearning
          ELSE gm.med_review
        END
      ) AS estimated_seconds
    FROM review_logs rl
    JOIN global_medians gm ON gm.user_id = rl.user_id
    WHERE rl.reviewed_at > now() - interval '14 days'
    GROUP BY rl.user_id, (rl.reviewed_at AT TIME ZONE 'America/Sao_Paulo')::date
    HAVING COUNT(*) >= 5
  ),
  global_ratios AS (
    SELECT
      CASE WHEN estimated_seconds > 0
        THEN real_seconds / estimated_seconds
        ELSE 1.20
      END AS ratio
    FROM global_daily
  )
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ratio)
  INTO v_global_factor
  FROM global_ratios;

  IF v_global_factor IS NOT NULL AND v_global_factor > 0 THEN
    v_global_factor := LEAST(2.0, GREATEST(0.8, v_global_factor));
  ELSE
    v_global_factor := 1.20;
  END IF;

  RETURN jsonb_build_object(
    'calibration_factor', ROUND(v_global_factor, 3),
    'sessions_used', COALESCE(v_total_sessions, 0),
    'source', 'global'
  );
END;
$function$;
