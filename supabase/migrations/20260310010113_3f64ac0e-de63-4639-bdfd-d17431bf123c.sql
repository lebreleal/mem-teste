-- RPC: get_retention_over_time - returns weekly retention % for the last N days
CREATE OR REPLACE FUNCTION public.get_retention_over_time(p_user_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE(week_start text, correct bigint, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(date_trunc('week', rl.reviewed_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS week_start,
    COUNT(*) FILTER (WHERE rl.rating >= 2) AS correct,
    COUNT(*) AS total
  FROM review_logs rl
  WHERE rl.user_id = p_user_id
    AND rl.reviewed_at >= (now() - (p_days || ' days')::interval)
  GROUP BY date_trunc('week', rl.reviewed_at AT TIME ZONE 'America/Sao_Paulo')
  ORDER BY week_start;
$$;

-- RPC: get_cards_added_per_day - returns daily card creation counts for last N days
CREATE OR REPLACE FUNCTION public.get_cards_added_per_day(p_user_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE(day text, added bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char((c.created_at AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS day,
    COUNT(*) AS added
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
    AND c.created_at >= (now() - (p_days || ' days')::interval)
  GROUP BY (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY day;
$$;