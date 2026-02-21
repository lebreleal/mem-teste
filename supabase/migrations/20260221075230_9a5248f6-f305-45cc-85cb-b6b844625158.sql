
-- 1. Add state column to review_logs to track card state at review time
ALTER TABLE review_logs ADD COLUMN IF NOT EXISTS state integer DEFAULT NULL;

-- 2. Update get_all_user_deck_stats to count state 3 as learning
CREATE OR REPLACE FUNCTION public.get_all_user_deck_stats(p_user_id uuid, p_tz_offset_minutes integer DEFAULT 0)
 RETURNS TABLE(deck_id uuid, new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH user_today AS (
  SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
),
new_cards_studied AS (
  SELECT DISTINCT rl.card_id, c.state, c.deck_id
  FROM public.review_logs rl
  JOIN public.cards c ON c.id = rl.card_id
  JOIN public.decks d ON d.id = c.deck_id
  CROSS JOIN user_today ut
  WHERE (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut.today_date
    AND d.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.review_logs rl2
      WHERE rl2.card_id = rl.card_id
        AND (rl2.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date < ut.today_date
    )
    AND c.state IN (1, 2, 3)
)
SELECT
  c.deck_id,
  COUNT(*) FILTER (WHERE c.state = 0),
  COUNT(*) FILTER (WHERE c.state IN (1, 3)),
  COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()),
  COUNT(DISTINCT rt.card_id) FILTER (WHERE rt.card_id IS NOT NULL AND c.state = 2 AND c.scheduled_date > now()),
  (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id),
  (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id AND ncs.state = 2)
FROM public.cards c
JOIN public.decks d ON d.id = c.deck_id
LEFT JOIN (
  SELECT DISTINCT rl3.card_id
  FROM public.review_logs rl3
  CROSS JOIN (SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date) ut2
  WHERE (rl3.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut2.today_date
) rt ON rt.card_id = c.id
WHERE d.user_id = p_user_id
GROUP BY c.deck_id;
$function$;

-- 3. Update get_deck_stats to count state 3 as learning
CREATE OR REPLACE FUNCTION public.get_deck_stats(p_deck_id uuid, p_tz_offset_minutes integer DEFAULT 0)
 RETURNS TABLE(new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH user_today AS (
  SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
),
deck_cards AS (
  SELECT id, state, scheduled_date FROM public.cards WHERE deck_id = p_deck_id
),
today_reviewed AS (
  SELECT DISTINCT rl.card_id
  FROM public.review_logs rl
  JOIN deck_cards dc ON dc.id = rl.card_id
  CROSS JOIN user_today ut
  WHERE (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut.today_date
    AND dc.state = 2
    AND dc.scheduled_date > now()
),
new_cards_studied AS (
  SELECT DISTINCT rl.card_id, dc.state
  FROM public.review_logs rl
  JOIN deck_cards dc ON dc.id = rl.card_id
  CROSS JOIN user_today ut
  WHERE (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut.today_date
    AND NOT EXISTS (
      SELECT 1 FROM public.review_logs rl2
      WHERE rl2.card_id = rl.card_id
        AND (rl2.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date < ut.today_date
    )
    AND dc.state IN (1, 2, 3)
)
SELECT
  COUNT(*) FILTER (WHERE dc.state = 0),
  COUNT(*) FILTER (WHERE dc.state IN (1, 3)),
  COUNT(*) FILTER (WHERE dc.state = 2 AND dc.scheduled_date <= now()),
  (SELECT COUNT(*) FROM today_reviewed),
  (SELECT COUNT(*) FROM new_cards_studied),
  (SELECT COUNT(*) FROM new_cards_studied WHERE state = 2)
FROM deck_cards dc;
$function$;

-- 4. Update get_plan_metrics to count state 3 as learning
CREATE OR REPLACE FUNCTION public.get_plan_metrics(p_user_id uuid, p_deck_ids uuid[])
 RETURNS TABLE(total_new bigint, total_review bigint, total_learning bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE c.state = 0) AS total_new,
    COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS total_review,
    COUNT(*) FILTER (WHERE c.state IN (1, 3)) AS total_learning
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
    AND c.deck_id = ANY(p_deck_ids);
$function$;

-- 5. Update get_forecast_params to include relearning timing using state column
CREATE OR REPLACE FUNCTION public.get_forecast_params(p_user_id uuid, p_deck_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'avg_new_seconds', COALESCE(AVG(dur) FILTER (WHERE pre_state = 0), 30),
      'avg_review_seconds', COALESCE(AVG(dur) FILTER (WHERE pre_state = 2), 8),
      'avg_learning_seconds', COALESCE(AVG(dur) FILTER (WHERE pre_state = 1), 15),
      'avg_relearning_seconds', COALESCE(AVG(dur) FILTER (WHERE pre_state = 3), 12)
    )
    FROM (
      SELECT
        LEAST(300, GREATEST(1, EXTRACT(EPOCH FROM (rl.reviewed_at -
          LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at)
        )))) AS dur,
        COALESCE(
          rl.state,
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM review_logs rl2
              WHERE rl2.card_id = rl.card_id AND rl2.reviewed_at < rl.reviewed_at
            ) THEN 0
            WHEN (SELECT COUNT(*) FROM review_logs rl3
                  WHERE rl3.card_id = rl.card_id AND rl3.reviewed_at < rl.reviewed_at) < 3 THEN 1
            ELSE 2
          END
        ) AS pre_state
      FROM review_logs rl
      WHERE rl.user_id = p_user_id AND rl.reviewed_at > now() - interval '30 days'
    ) sub WHERE dur IS NOT NULL
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
$function$;
