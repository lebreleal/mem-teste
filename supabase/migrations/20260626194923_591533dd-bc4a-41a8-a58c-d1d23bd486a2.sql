CREATE OR REPLACE FUNCTION public.count_cards_by_deck_ids(p_deck_ids uuid[])
RETURNS TABLE(deck_id uuid, total bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.deck_id, count(*)::bigint AS total
  FROM public.cards c
  WHERE c.deck_id = ANY(p_deck_ids)
  GROUP BY c.deck_id
$$;

GRANT EXECUTE ON FUNCTION public.count_cards_by_deck_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_cards_by_deck_ids(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.count_cards_by_deck_ids(uuid[]) TO service_role;