
DROP FUNCTION IF EXISTS public.get_all_user_deck_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_all_user_deck_stats(p_user_id uuid)
 RETURNS TABLE(deck_id uuid, new_count bigint, learning_count bigint, review_count bigint, reviewed_today bigint, new_reviewed_today bigint, new_graduated_today bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH new_cards_studied AS (
    SELECT DISTINCT rl.card_id, c.state, c.deck_id
    FROM public.review_logs rl
    JOIN public.cards c ON c.id = rl.card_id
    JOIN public.decks d ON d.id = c.deck_id
    WHERE rl.reviewed_at::date = CURRENT_DATE
      AND d.user_id = p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.review_logs rl2
        WHERE rl2.card_id = rl.card_id
        AND rl2.reviewed_at::date < CURRENT_DATE
      )
      AND c.state IN (1, 2)
  )
  SELECT c.deck_id,
    COUNT(*) FILTER (WHERE c.state = 0) AS new_count,
    COUNT(*) FILTER (WHERE c.state = 1) AS learning_count,
    COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS review_count,
    COUNT(DISTINCT rt.card_id) FILTER (WHERE rt.card_id IS NOT NULL AND c.state = 2 AND c.scheduled_date > now()) AS reviewed_today,
    (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id) AS new_reviewed_today,
    (SELECT COUNT(*) FROM new_cards_studied ncs WHERE ncs.deck_id = c.deck_id AND ncs.state = 2) AS new_graduated_today
  FROM public.cards c
  JOIN public.decks d ON d.id = c.deck_id
  LEFT JOIN (
    SELECT DISTINCT card_id FROM public.review_logs WHERE reviewed_at::date = CURRENT_DATE
  ) rt ON rt.card_id = c.id
  WHERE d.user_id = p_user_id
  GROUP BY c.deck_id;
$$;
