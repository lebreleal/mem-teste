
CREATE OR REPLACE FUNCTION public.get_recent_cards(
  p_user_id uuid,
  p_folder_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  deck_id uuid,
  deck_name text,
  parent_deck_name text,
  folder_name text,
  card_id uuid,
  front_content text,
  back_content text,
  card_type text,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    d.id AS deck_id,
    d.name AS deck_name,
    pd.name AS parent_deck_name,
    f.name AS folder_name,
    c.id AS card_id,
    c.front_content,
    c.back_content,
    c.card_type,
    c.updated_at
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  LEFT JOIN decks pd ON pd.id = d.parent_deck_id
  LEFT JOIN folders f ON f.id = d.folder_id
  WHERE d.user_id = p_user_id
    AND d.is_archived = false
    AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)
  ORDER BY c.updated_at DESC
  LIMIT p_limit;
$$;
