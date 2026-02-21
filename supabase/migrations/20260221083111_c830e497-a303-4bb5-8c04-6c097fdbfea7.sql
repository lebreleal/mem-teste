
DROP FUNCTION IF EXISTS get_forecast_params(uuid, uuid[]);

CREATE OR REPLACE FUNCTION get_forecast_params(p_user_id uuid, p_deck_ids uuid[])
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
SELECT jsonb_build_object(
  'decks', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'algorithm_mode', d.algorithm_mode,
      'requested_retention', d.requested_retention,
      'max_interval', d.max_interval,
      'learning_steps', d.learning_steps,
      'daily_new_limit', d.daily_new_limit,
      'daily_review_limit', d.daily_review_limit
    )), '[]'::jsonb)
    FROM decks d WHERE d.id = ANY(p_deck_ids) AND d.user_id = p_user_id
  ),
  'cards', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'deck_id', c.deck_id, 'state', c.state,
      'stability', c.stability, 'difficulty', c.difficulty,
      'scheduled_date', c.scheduled_date
    )), '[]'::jsonb)
    FROM cards c WHERE c.deck_id = ANY(p_deck_ids)
  ),
  'avg_new_cards_per_day', (
    SELECT COALESCE(
      ROUND(COUNT(*)::numeric / GREATEST(1,
        EXTRACT(days FROM (now() - MIN(c.created_at)))
      )), 40
    )
    FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = p_user_id AND c.deck_id = ANY(p_deck_ids)
      AND d.is_archived = false AND c.created_at > now() - interval '365 days'
  ),
  'timing', (
    SELECT jsonb_build_object(
      'avg_new_seconds',
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 0), 30),
      'avg_review_seconds',
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 2), 8),
      'avg_learning_seconds',
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 1), 15),
      'avg_relearning_seconds',
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur) FILTER (WHERE pre_state = 3), 12)
    )
    FROM (
      SELECT dur, pre_state FROM (
        SELECT
          CASE
            WHEN raw_gap <= 300
            THEN LEAST(60, GREATEST(1, raw_gap))
            ELSE NULL
          END AS dur,
          COALESCE(
            rl_state,
            CASE
              WHEN prev_count = 0 THEN 0
              WHEN prev_count < 3 THEN 1
              WHEN raw_gap > 86400 THEN 2
              ELSE 1
            END
          ) AS pre_state
        FROM (
          SELECT
            rl.state AS rl_state,
            EXTRACT(EPOCH FROM (rl.reviewed_at -
              LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at)
            )) AS raw_gap,
            (SELECT COUNT(*) FROM review_logs rl2
             WHERE rl2.card_id = rl.card_id AND rl2.reviewed_at < rl.reviewed_at
            ) AS prev_count
          FROM review_logs rl
          WHERE rl.user_id = p_user_id AND rl.reviewed_at > now() - interval '30 days'
        ) base
      ) sub2
      WHERE dur IS NOT NULL
    ) sub
  ),
  'rating_distribution', (
    SELECT COALESCE(jsonb_object_agg(bucket, dist), '{}'::jsonb) FROM (
      SELECT bucket, jsonb_build_object(
        'again', COUNT(*) FILTER (WHERE rating = 1),
        'hard',  COUNT(*) FILTER (WHERE rating = 2),
        'good',  COUNT(*) FILTER (WHERE rating = 3),
        'easy',  COUNT(*) FILTER (WHERE rating = 4),
        'total', COUNT(*)
      ) AS dist
      FROM (
        SELECT rl.rating,
          CASE
            WHEN recall >= 0.9 THEN 'high'
            WHEN recall >= 0.7 THEN 'mid'
            ELSE 'low'
          END AS bucket
        FROM (
          SELECT rl2.rating,
            POWER(1 + (19.0/81) * GREATEST(0,
              EXTRACT(EPOCH FROM (rl2.reviewed_at - c2.last_reviewed_at)) / 86400.0
            ) / GREATEST(0.1, c2.stability), -0.5) AS recall
          FROM review_logs rl2
          JOIN cards c2 ON c2.id = rl2.card_id
          WHERE rl2.user_id = p_user_id
            AND rl2.reviewed_at > now() - interval '90 days'
            AND c2.stability > 0 AND c2.last_reviewed_at IS NOT NULL
        ) rl
      ) bucketed
      GROUP BY bucket
    ) agg
  ),
  'total_reviews_90d', (
    SELECT COUNT(*) FROM review_logs
    WHERE user_id = p_user_id AND reviewed_at > now() - interval '90 days'
  )
);
$$;
