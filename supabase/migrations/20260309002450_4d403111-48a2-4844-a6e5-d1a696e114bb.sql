
CREATE OR REPLACE FUNCTION public.get_card_statistics(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_frozen_threshold timestamptz := now() + interval '50 years';
  v_month_start date;
  v_month_end date;
  v_days_in_month integer;
BEGIN
  v_month_start := date_trunc('month', now())::date;
  v_month_end := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date;
  v_days_in_month := EXTRACT(day FROM v_month_end);

  SELECT jsonb_build_object(
    'card_counts', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'new', COUNT(*) FILTER (WHERE c.state = 0 AND c.scheduled_date <= v_frozen_threshold),
        'learning', COUNT(*) FILTER (WHERE c.state = 1 AND c.scheduled_date <= v_frozen_threshold),
        'review', COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= v_frozen_threshold),
        'relearning', COUNT(*) FILTER (WHERE c.state = 3 AND c.scheduled_date <= v_frozen_threshold),
        'young', COUNT(*) FILTER (WHERE c.state = 2 AND c.stability < 21 AND c.scheduled_date <= v_frozen_threshold),
        'mature', COUNT(*) FILTER (WHERE c.state = 2 AND c.stability >= 21 AND c.scheduled_date <= v_frozen_threshold),
        'frozen', COUNT(*) FILTER (WHERE c.scheduled_date > v_frozen_threshold)
      )
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE d.user_id = p_user_id AND d.is_archived = false
    ),
    'interval_distribution', (
      SELECT COALESCE(jsonb_agg(interval_days ORDER BY interval_days), '[]'::jsonb)
      FROM (
        SELECT GREATEST(0, EXTRACT(EPOCH FROM (c.scheduled_date - COALESCE(c.last_reviewed_at, c.created_at))) / 86400.0)::integer AS interval_days
        FROM cards c
        JOIN decks d ON d.id = c.deck_id
        WHERE d.user_id = p_user_id AND d.is_archived = false
          AND c.state = 2 AND c.scheduled_date <= v_frozen_threshold
      ) sub
    ),
    'stability_distribution', (
      SELECT COALESCE(jsonb_agg(round_stab ORDER BY round_stab), '[]'::jsonb)
      FROM (
        SELECT ROUND(c.stability::numeric, 1) AS round_stab
        FROM cards c
        JOIN decks d ON d.id = c.deck_id
        WHERE d.user_id = p_user_id AND d.is_archived = false
          AND c.state = 2 AND c.scheduled_date <= v_frozen_threshold
      ) sub
    ),
    'difficulty_distribution', (
      SELECT COALESCE(jsonb_agg(round_diff ORDER BY round_diff), '[]'::jsonb)
      FROM (
        SELECT ROUND(c.difficulty::numeric, 1) AS round_diff
        FROM cards c
        JOIN decks d ON d.id = c.deck_id
        WHERE d.user_id = p_user_id AND d.is_archived = false
          AND c.state IN (1,2,3) AND c.scheduled_date <= v_frozen_threshold
      ) sub
    ),
    'retrievability_distribution', (
      SELECT COALESCE(jsonb_agg(r_val ORDER BY r_val), '[]'::jsonb)
      FROM (
        SELECT ROUND(
          POWER(1.0 + (19.0/81.0) * GREATEST(0,
            EXTRACT(EPOCH FROM (now() - COALESCE(c.last_reviewed_at, c.created_at))) / 86400.0
          ) / GREATEST(0.1, c.stability), -0.5) * 100
        , 1) AS r_val
        FROM cards c
        JOIN decks d ON d.id = c.deck_id
        WHERE d.user_id = p_user_id AND d.is_archived = false
          AND c.state = 2 AND c.stability > 0 AND c.scheduled_date <= v_frozen_threshold
      ) sub
    ),
    'true_retention', (
      SELECT jsonb_build_object(
        'correct', COUNT(*) FILTER (WHERE rl.rating >= 2),
        'total', COUNT(*),
        'rate', CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE rl.rating >= 2)::numeric / COUNT(*)::numeric * 100, 1)
          ELSE 0 END
      )
      FROM review_logs rl
      WHERE rl.user_id = p_user_id AND rl.state = 2
        AND rl.reviewed_at > now() - interval '30 days'
    ),
    'button_counts', (
      SELECT jsonb_build_object(
        'again', COUNT(*) FILTER (WHERE rl.rating = 1),
        'hard', COUNT(*) FILTER (WHERE rl.rating = 2),
        'good', COUNT(*) FILTER (WHERE rl.rating = 3),
        'easy', COUNT(*) FILTER (WHERE rl.rating = 4),
        'total', COUNT(*)
      )
      FROM review_logs rl
      WHERE rl.user_id = p_user_id AND rl.reviewed_at > now() - interval '30 days'
    ),
    'month_summary', (
      SELECT jsonb_build_object(
        'days_studied', COUNT(DISTINCT date(rl.reviewed_at)),
        'days_in_month', v_days_in_month,
        'total_reviews', COUNT(*),
        'avg_reviews_per_day', CASE WHEN COUNT(DISTINCT date(rl.reviewed_at)) > 0
          THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT date(rl.reviewed_at))::numeric)
          ELSE 0 END
      )
      FROM review_logs rl
      WHERE rl.user_id = p_user_id
        AND date(rl.reviewed_at) >= v_month_start
        AND date(rl.reviewed_at) <= v_month_end
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
