
DROP FUNCTION IF EXISTS public.get_deck_stats(uuid);

CREATE FUNCTION public.get_deck_stats(p_deck_id uuid)
RETURNS TABLE(new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH deck_cards AS (
    SELECT id, state, scheduled_date FROM public.cards WHERE deck_id = p_deck_id
  ),
  today_reviewed AS (
    -- Cards completed today: state=2 with future scheduled_date, reviewed today
    SELECT DISTINCT rl.card_id
    FROM public.review_logs rl
    JOIN deck_cards dc ON dc.id = rl.card_id
    WHERE rl.reviewed_at::date = CURRENT_DATE
      AND dc.state = 2
      AND dc.scheduled_date > now()
  ),
  -- ALL new cards studied today (now in state 1 or 2) - used for Novos calculation
  new_cards_studied AS (
    SELECT DISTINCT rl.card_id, dc.state
    FROM public.review_logs rl
    JOIN deck_cards dc ON dc.id = rl.card_id
    WHERE rl.reviewed_at::date = CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM public.review_logs rl2
        WHERE rl2.card_id = rl.card_id
        AND rl2.reviewed_at::date < CURRENT_DATE
      )
      AND dc.state IN (1, 2)
  )
  SELECT
    COUNT(*) FILTER (WHERE dc.state = 0) AS new_count,
    COUNT(*) FILTER (WHERE dc.state = 1) AS learning_count,
    COUNT(*) FILTER (WHERE dc.state = 2 AND dc.scheduled_date <= now()) AS review_count,
    (SELECT COUNT(*) FROM today_reviewed) AS reviewed_today,
    -- Total new cards studied today (state 1 + 2) - for reducing Novos display
    (SELECT COUNT(*) FROM new_cards_studied) AS new_reviewed_today,
    -- New cards that graduated to state 2 today - for adjusting Dominados display
    (SELECT COUNT(*) FROM new_cards_studied WHERE state = 2) AS new_graduated_today
  FROM deck_cards dc;
$$;
