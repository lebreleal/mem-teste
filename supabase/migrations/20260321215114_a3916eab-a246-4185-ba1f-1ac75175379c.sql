-- Fix new_count to exclude buried cards (scheduled for tomorrow+)
-- Only count new cards whose scheduled_date is within today (user timezone)

CREATE OR REPLACE FUNCTION public.get_all_user_deck_stats(p_user_id uuid, p_tz_offset_minutes integer DEFAULT 0)
 RETURNS TABLE(deck_id uuid, new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH user_today AS (
  SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
),
end_of_today AS (
  SELECT (((now() + (p_tz_offset_minutes || ' minutes')::interval)::date + interval '1 day') - (p_tz_offset_minutes || ' minutes')::interval) AS eod_utc
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
  COUNT(*) FILTER (WHERE (c.state = 0 OR c.state IS NULL) AND (c.scheduled_date IS NULL OR c.scheduled_date <= eot.eod_utc)),
  COUNT(*) FILTER (WHERE c.state IN (1, 3) AND (c.scheduled_date IS NULL OR c.scheduled_date <= ft.threshold)),
  COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now() AND c.scheduled_date <= ft.threshold),
  COUNT(DISTINCT rt.card_id) FILTER (WHERE rt.card_id IS NOT NULL AND c.state = 2 AND c.scheduled_date > now() AND c.scheduled_date <= ft.threshold),
  (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id),
  (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id AND ncs.state = 2)
FROM public.cards c
JOIN public.decks d ON d.id = c.deck_id
CROSS JOIN frozen_threshold ft
CROSS JOIN end_of_today eot
LEFT JOIN (
  SELECT DISTINCT rl3.card_id
  FROM public.review_logs rl3
  CROSS JOIN (SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date) ut2
  WHERE (rl3.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = ut2.today_date
) rt ON rt.card_id = c.id
WHERE d.user_id = p_user_id
GROUP BY c.deck_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_deck_stats(p_deck_id uuid, p_tz_offset_minutes integer DEFAULT 0)
 RETURNS TABLE(new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH user_today AS (
  SELECT (now() + (p_tz_offset_minutes || ' minutes')::interval)::date AS today_date
),
end_of_today AS (
  SELECT (((now() + (p_tz_offset_minutes || ' minutes')::interval)::date + interval '1 day') - (p_tz_offset_minutes || ' minutes')::interval) AS eod_utc
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
  COUNT(*) FILTER (WHERE (dc.state = 0 OR dc.state IS NULL) AND (dc.scheduled_date IS NULL OR dc.scheduled_date <= eot.eod_utc)),
  COUNT(*) FILTER (WHERE dc.state IN (1, 3) AND (dc.scheduled_date IS NULL OR dc.scheduled_date <= ft.threshold)),
  COUNT(*) FILTER (WHERE dc.state = 2 AND dc.scheduled_date <= now() AND dc.scheduled_date <= ft.threshold),
  (SELECT COUNT(*) FROM today_reviewed),
  (SELECT COUNT(*) FROM new_cards_studied),
  (SELECT COUNT(*) FROM new_cards_studied WHERE state = 2)
FROM deck_cards dc
CROSS JOIN frozen_threshold ft
CROSS JOIN end_of_today eot;
$function$;