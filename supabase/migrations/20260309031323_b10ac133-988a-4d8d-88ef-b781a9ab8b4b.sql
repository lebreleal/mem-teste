
-- Update get_card_statistics to include young and mature retention breakdown
CREATE OR REPLACE FUNCTION public.get_card_statistics(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_card_counts jsonb;
  v_intervals double precision[];
  v_stabilities double precision[];
  v_difficulties double precision[];
  v_retrievabilities double precision[];
  v_true_retention jsonb;
  v_young_retention jsonb;
  v_mature_retention jsonb;
  v_button_counts jsonb;
  v_month_summary jsonb;
  v_now timestamptz := now();
  v_30d_ago timestamptz := now() - interval '30 days';
  v_month_start timestamptz;
  v_days_in_month int;
BEGIN
  -- Card counts
  SELECT jsonb_build_object(
    'total', COUNT(*)::int,
    'new', COUNT(*) FILTER (WHERE c.state = 0)::int,
    'learning', COUNT(*) FILTER (WHERE c.state = 1)::int,
    'review', COUNT(*) FILTER (WHERE c.state = 2)::int,
    'relearning', COUNT(*) FILTER (WHERE c.state = 3)::int,
    'young', COUNT(*) FILTER (WHERE c.state = 2 AND c.stability < 21)::int,
    'mature', COUNT(*) FILTER (WHERE c.state = 2 AND c.stability >= 21)::int,
    'frozen', COUNT(*) FILTER (WHERE c.scheduled_date > v_now + interval '100 years')::int
  )
  INTO v_card_counts
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id;

  -- Distributions
  SELECT
    COALESCE(array_agg(GREATEST(0, EXTRACT(EPOCH FROM (c.scheduled_date - COALESCE(c.last_reviewed_at, c.created_at))) / 86400)::double precision) FILTER (WHERE c.state = 2), ARRAY[]::double precision[]),
    COALESCE(array_agg(c.stability) FILTER (WHERE c.state IN (2,3)), ARRAY[]::double precision[]),
    COALESCE(array_agg(c.difficulty) FILTER (WHERE c.state IN (2,3)), ARRAY[]::double precision[]),
    COALESCE(array_agg(
      ROUND((POWER(0.9, (EXTRACT(EPOCH FROM (v_now - COALESCE(c.last_reviewed_at, c.created_at))) / 86400) / GREATEST(c.stability, 0.1))) * 100)::double precision
    ) FILTER (WHERE c.state IN (2,3) AND c.stability > 0), ARRAY[]::double precision[])
  INTO v_intervals, v_stabilities, v_difficulties, v_retrievabilities
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id AND c.state IN (2, 3);

  -- True retention (overall, last 30 days)
  SELECT jsonb_build_object(
    'correct', COUNT(*) FILTER (WHERE rl.rating >= 2)::int,
    'total', COUNT(*)::int,
    'rate', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE rl.rating >= 2)::numeric / COUNT(*)) * 100, 1)
      ELSE 0 END
  )
  INTO v_true_retention
  FROM review_logs rl
  WHERE rl.user_id = p_user_id AND rl.reviewed_at >= v_30d_ago;

  -- Young retention (cards with stability < 21 at time of review)
  SELECT jsonb_build_object(
    'correct', COUNT(*) FILTER (WHERE rl.rating >= 2)::int,
    'total', COUNT(*)::int,
    'rate', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE rl.rating >= 2)::numeric / COUNT(*)) * 100, 1)
      ELSE 0 END
  )
  INTO v_young_retention
  FROM review_logs rl
  WHERE rl.user_id = p_user_id
    AND rl.reviewed_at >= v_30d_ago
    AND rl.stability < 21;

  -- Mature retention (cards with stability >= 21 at time of review)
  SELECT jsonb_build_object(
    'correct', COUNT(*) FILTER (WHERE rl.rating >= 2)::int,
    'total', COUNT(*)::int,
    'rate', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE rl.rating >= 2)::numeric / COUNT(*)) * 100, 1)
      ELSE 0 END
  )
  INTO v_mature_retention
  FROM review_logs rl
  WHERE rl.user_id = p_user_id
    AND rl.reviewed_at >= v_30d_ago
    AND rl.stability >= 21;

  -- Button counts
  SELECT jsonb_build_object(
    'again', COUNT(*) FILTER (WHERE rl.rating = 1)::int,
    'hard', COUNT(*) FILTER (WHERE rl.rating = 2)::int,
    'good', COUNT(*) FILTER (WHERE rl.rating = 3)::int,
    'easy', COUNT(*) FILTER (WHERE rl.rating = 4)::int,
    'total', COUNT(*)::int
  )
  INTO v_button_counts
  FROM review_logs rl
  WHERE rl.user_id = p_user_id AND rl.reviewed_at >= v_30d_ago;

  -- Month summary
  v_month_start := date_trunc('month', v_now);
  v_days_in_month := EXTRACT(DAY FROM (v_month_start + interval '1 month' - interval '1 day'))::int;

  SELECT jsonb_build_object(
    'days_studied', COUNT(DISTINCT reviewed_at::date)::int,
    'days_in_month', v_days_in_month,
    'total_reviews', COUNT(*)::int,
    'avg_reviews_per_day', CASE WHEN COUNT(DISTINCT reviewed_at::date) > 0
      THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT reviewed_at::date)::numeric, 1)
      ELSE 0 END
  )
  INTO v_month_summary
  FROM review_logs
  WHERE user_id = p_user_id AND reviewed_at >= v_month_start;

  v_result := jsonb_build_object(
    'card_counts', v_card_counts,
    'interval_distribution', to_jsonb(v_intervals),
    'stability_distribution', to_jsonb(v_stabilities),
    'difficulty_distribution', to_jsonb(v_difficulties),
    'retrievability_distribution', to_jsonb(v_retrievabilities),
    'true_retention', v_true_retention,
    'young_retention', v_young_retention,
    'mature_retention', v_mature_retention,
    'button_counts', v_button_counts,
    'month_summary', v_month_summary
  );

  RETURN v_result;
END;
$$;
