
-- Fix count_descendant_cards_by_state to detect frozen by scheduled_date > 50 years
CREATE OR REPLACE FUNCTION public.count_descendant_cards_by_state(p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH RECURSIVE descendant_decks AS (
    SELECT id FROM decks WHERE id = p_deck_id AND user_id = auth.uid()
    UNION ALL
    SELECT d.id FROM decks d JOIN descendant_decks dd ON d.parent_deck_id = dd.id
  ),
  counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE (c.state = 0 OR c.state IS NULL) AND c.scheduled_date <= now() + interval '50 years') AS new_count,
      COUNT(*) FILTER (WHERE c.state IN (1, 3) AND c.scheduled_date <= now() + interval '50 years') AS learning_count,
      COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now() AND c.scheduled_date <= now() + interval '50 years') AS review_count,
      COUNT(*) FILTER (WHERE c.card_type = 'basic') AS basic_count,
      COUNT(*) FILTER (WHERE c.card_type = 'cloze') AS cloze_count,
      COUNT(*) FILTER (WHERE c.card_type = 'multiple_choice') AS mc_count,
      COUNT(*) FILTER (WHERE c.card_type = 'image_occlusion') AS occlusion_count,
      COUNT(*) FILTER (WHERE c.scheduled_date > now() + interval '50 years') AS frozen_count
    FROM cards c
    WHERE c.deck_id IN (SELECT id FROM descendant_decks)
  )
  SELECT jsonb_build_object(
    'total', total,
    'new_count', new_count,
    'learning_count', learning_count,
    'review_count', review_count,
    'basic_count', basic_count,
    'cloze_count', cloze_count,
    'mc_count', mc_count,
    'occlusion_count', occlusion_count,
    'frozen_count', frozen_count
  ) FROM counts;
$$;

-- Fix get_all_user_deck_stats to exclude frozen cards
CREATE OR REPLACE FUNCTION public.get_all_user_deck_stats(p_user_id uuid, p_tz_offset_minutes integer DEFAULT 0)
 RETURNS TABLE(deck_id uuid, new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
WITH user_today AS (
  SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
),
frozen_threshold AS (
  SELECT now() + interval '50 years' AS threshold
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
  COUNT(*) FILTER (WHERE c.state = 0 AND c.scheduled_date <= ft.threshold),
  COUNT(*) FILTER (WHERE c.state IN (1, 3) AND c.scheduled_date <= ft.threshold),
  COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now() AND c.scheduled_date <= ft.threshold),
  COUNT(DISTINCT rt.card_id) FILTER (WHERE rt.card_id IS NOT NULL AND c.state = 2 AND c.scheduled_date > now() AND c.scheduled_date <= ft.threshold),
  (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id),
  (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id AND ncs.state = 2)
FROM public.cards c
JOIN public.decks d ON d.id = c.deck_id
CROSS JOIN frozen_threshold ft
LEFT JOIN (
  SELECT DISTINCT rl3.card_id
  FROM public.review_logs rl3
  CROSS JOIN (SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date) ut2
  WHERE (rl3.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut2.today_date
) rt ON rt.card_id = c.id
WHERE d.user_id = p_user_id
GROUP BY c.deck_id;
$$;

-- Fix get_deck_stats to exclude frozen cards
CREATE OR REPLACE FUNCTION public.get_deck_stats(p_deck_id uuid, p_tz_offset_minutes integer DEFAULT 0)
 RETURNS TABLE(new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
WITH user_today AS (
  SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
),
frozen_threshold AS (
  SELECT now() + interval '50 years' AS threshold
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
  COUNT(*) FILTER (WHERE dc.state = 0 AND dc.scheduled_date <= ft.threshold),
  COUNT(*) FILTER (WHERE dc.state IN (1, 3) AND dc.scheduled_date <= ft.threshold),
  COUNT(*) FILTER (WHERE dc.state = 2 AND dc.scheduled_date <= now() AND dc.scheduled_date <= ft.threshold),
  (SELECT COUNT(*) FROM today_reviewed),
  (SELECT COUNT(*) FROM new_cards_studied),
  (SELECT COUNT(*) FROM new_cards_studied WHERE state = 2)
FROM deck_cards dc
CROSS JOIN frozen_threshold ft;
$$;

-- Fix get_plan_metrics to exclude frozen cards
CREATE OR REPLACE FUNCTION public.get_plan_metrics(p_user_id uuid, p_deck_ids uuid[])
 RETURNS TABLE(total_new bigint, total_review bigint, total_learning bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (WHERE c.state = 0 AND c.scheduled_date <= now() + interval '50 years') AS total_new,
    COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now() AND c.scheduled_date <= now() + interval '50 years') AS total_review,
    COUNT(*) FILTER (WHERE c.state IN (1, 3) AND c.scheduled_date <= now() + interval '50 years') AS total_learning
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
    AND c.deck_id = ANY(p_deck_ids);
$$;
