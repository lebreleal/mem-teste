
-- RPC: batch reorder decks in a single transaction
CREATE OR REPLACE FUNCTION public.batch_reorder_decks(p_deck_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  FOR i IN 1..array_length(p_deck_ids, 1) LOOP
    UPDATE decks
    SET sort_order = i - 1
    WHERE id = p_deck_ids[i]
      AND user_id = auth.uid();
  END LOOP;
END;
$$;

-- RPC: get study queue daily limits in a single query
CREATE OR REPLACE FUNCTION public.get_study_queue_limits(p_user_id uuid, p_card_ids uuid[])
RETURNS TABLE(new_reviewed_today bigint, review_reviewed_today bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH today_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM review_logs rl
    WHERE rl.card_id = ANY(p_card_ids)
      AND rl.user_id = p_user_id
      AND rl.reviewed_at >= (CURRENT_DATE::timestamptz)
  ),
  prior_reviewed AS (
    SELECT DISTINCT rl.card_id
    FROM review_logs rl
    WHERE rl.card_id = ANY(p_card_ids)
      AND rl.user_id = p_user_id
      AND rl.reviewed_at < (CURRENT_DATE::timestamptz)
  )
  SELECT
    COUNT(*) FILTER (WHERE tr.card_id IS NOT NULL AND pr.card_id IS NULL) AS new_reviewed_today,
    COUNT(*) FILTER (WHERE tr.card_id IS NOT NULL AND pr.card_id IS NOT NULL) AS review_reviewed_today
  FROM today_reviewed tr
  LEFT JOIN prior_reviewed pr ON pr.card_id = tr.card_id;
$$;
