
DROP FUNCTION IF EXISTS public.get_deck_stats(uuid);
DROP FUNCTION IF EXISTS public.get_all_user_deck_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_deck_stats(p_deck_id uuid)
RETURNS TABLE(new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  )
  SELECT
    COUNT(*) FILTER (WHERE dc.state = 0) AS new_count,
    COUNT(*) FILTER (WHERE dc.state = 1) AS learning_count,
    COUNT(*) FILTER (WHERE dc.state = 2 AND dc.scheduled_date <= now()) AS review_count,
    (SELECT COUNT(*) FROM today_reviewed) AS reviewed_today
  FROM deck_cards dc;
$$;

CREATE OR REPLACE FUNCTION public.get_all_user_deck_stats(p_user_id uuid)
RETURNS TABLE(deck_id uuid, new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.deck_id,
    COUNT(*) FILTER (WHERE c.state = 0) AS new_count,
    COUNT(*) FILTER (WHERE c.state = 1) AS learning_count,
    COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS review_count,
    COUNT(DISTINCT rt.card_id) FILTER (WHERE rt.card_id IS NOT NULL AND c.state = 2 AND c.scheduled_date > now()) AS reviewed_today
  FROM public.cards c
  JOIN public.decks d ON d.id = c.deck_id
  LEFT JOIN (
    SELECT DISTINCT card_id FROM public.review_logs WHERE reviewed_at::date = CURRENT_DATE
  ) rt ON rt.card_id = c.id
  WHERE d.user_id = p_user_id
  GROUP BY c.deck_id;
$$;
