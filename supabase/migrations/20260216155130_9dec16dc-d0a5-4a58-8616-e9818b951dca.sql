
DROP FUNCTION IF EXISTS public.get_deck_stats(uuid);

CREATE FUNCTION public.get_deck_stats(p_deck_id uuid)
RETURNS TABLE(new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint)
LANGUAGE sql STABLE
AS $$
  WITH deck_cards AS (
    SELECT id, state, scheduled_date FROM public.cards WHERE deck_id = p_deck_id
  ),
  today_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM public.review_logs rl
    JOIN deck_cards dc ON dc.id = rl.card_id
    WHERE rl.reviewed_at::date = CURRENT_DATE
      AND dc.state = 2
      AND dc.scheduled_date > now()
  ),
  new_graduated AS (
    SELECT tr.card_id
    FROM today_reviewed tr
    WHERE NOT EXISTS (
      SELECT 1 FROM public.review_logs rl
      WHERE rl.card_id = tr.card_id
      AND rl.reviewed_at::date < CURRENT_DATE
    )
  )
  SELECT
    COUNT(*) FILTER (WHERE dc.state = 0) AS new_count,
    COUNT(*) FILTER (WHERE dc.state = 1) AS learning_count,
    COUNT(*) FILTER (WHERE dc.state = 2 AND dc.scheduled_date <= now()) AS review_count,
    (SELECT COUNT(*) FROM today_reviewed) AS reviewed_today,
    (SELECT COUNT(*) FROM new_graduated) AS new_reviewed_today
  FROM deck_cards dc;
$$;
