CREATE OR REPLACE FUNCTION public.get_all_card_ids_for_user(p_user_id uuid)
RETURNS TABLE(id uuid, deck_id uuid) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.deck_id
  FROM cards c
  INNER JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
    AND d.is_archived = false;
$$;