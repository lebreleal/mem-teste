
CREATE OR REPLACE FUNCTION get_all_user_card_counts(p_user_id uuid)
RETURNS TABLE(
  deck_id uuid,
  total bigint,
  mastered bigint,
  novo bigint,
  facil bigint,
  bom bigint,
  dificil bigint,
  errei bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.deck_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE c.state >= 2)::bigint AS mastered,
    COUNT(*) FILTER (WHERE c.state = 0)::bigint AS novo,
    COUNT(*) FILTER (WHERE c.state > 0 AND COALESCE(c.difficulty, 5) <= 3)::bigint AS facil,
    COUNT(*) FILTER (WHERE c.state > 0 AND COALESCE(c.difficulty, 5) > 3 AND COALESCE(c.difficulty, 5) <= 5)::bigint AS bom,
    COUNT(*) FILTER (WHERE c.state > 0 AND COALESCE(c.difficulty, 5) > 5 AND COALESCE(c.difficulty, 5) <= 7)::bigint AS dificil,
    COUNT(*) FILTER (WHERE c.state > 0 AND COALESCE(c.difficulty, 5) > 7)::bigint AS errei
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
  GROUP BY c.deck_id;
$$;
