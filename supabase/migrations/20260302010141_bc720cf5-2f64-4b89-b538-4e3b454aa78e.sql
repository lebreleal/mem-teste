
CREATE OR REPLACE FUNCTION public.count_cards_per_deck(p_deck_ids uuid[])
RETURNS TABLE(deck_id uuid, card_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.deck_id, COUNT(*) as card_count
  FROM cards c
  WHERE c.deck_id = ANY(p_deck_ids)
  GROUP BY c.deck_id;
$$;
