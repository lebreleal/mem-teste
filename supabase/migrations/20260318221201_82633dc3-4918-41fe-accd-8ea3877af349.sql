
DROP FUNCTION IF EXISTS public.search_user_content(uuid, text, uuid, integer);

CREATE FUNCTION public.search_user_content(
  p_user_id uuid,
  p_query text,
  p_folder_id uuid DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS TABLE(
  result_type text,
  deck_id uuid,
  deck_name text,
  parent_deck_name text,
  folder_name text,
  card_id uuid,
  snippet text,
  rank real,
  front_content text,
  back_content text,
  card_type text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tsquery tsquery;
BEGIN
  BEGIN
    v_tsquery := websearch_to_tsquery('portuguese', p_query);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('portuguese', p_query);
  END;

  RETURN QUERY
  SELECT r.result_type, r.deck_id, r.deck_name, r.parent_deck_name,
         r.folder_name, r.card_id, r.snippet, r.rank,
         r.front_content, r.back_content, r.card_type
  FROM (
    SELECT
      'deck'::text AS result_type,
      d.id AS deck_id,
      d.name AS deck_name,
      pd.name AS parent_deck_name,
      f.name AS folder_name,
      NULL::uuid AS card_id,
      ts_headline('portuguese', d.name, v_tsquery,
        'StartSel=<b>, StopSel=</b>, MaxFragments=1, MaxWords=30, MinWords=10') AS snippet,
      ts_rank(d.search_vector, v_tsquery) AS rank,
      NULL::text AS front_content,
      NULL::text AS back_content,
      NULL::text AS card_type
    FROM decks d
    LEFT JOIN decks pd ON pd.id = d.parent_deck_id
    LEFT JOIN folders f ON f.id = d.folder_id
    WHERE d.user_id = p_user_id
      AND d.is_archived = false
      AND d.search_vector @@ v_tsquery
      AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)

    UNION ALL

    SELECT
      'card'::text AS result_type,
      d.id AS deck_id,
      d.name AS deck_name,
      pd.name AS parent_deck_name,
      f.name AS folder_name,
      c.id AS card_id,
      ts_headline('portuguese',
        regexp_replace(c.front_content || ' ' || c.back_content, '<[^>]*>', '', 'g'),
        v_tsquery,
        'StartSel=<b>, StopSel=</b>, MaxFragments=2, MaxWords=30, MinWords=10') AS snippet,
      ts_rank(c.search_vector, v_tsquery) AS rank,
      c.front_content AS front_content,
      c.back_content AS back_content,
      c.card_type AS card_type
    FROM cards c
    JOIN decks d ON d.id = c.deck_id
    LEFT JOIN decks pd ON pd.id = d.parent_deck_id
    LEFT JOIN folders f ON f.id = d.folder_id
    WHERE d.user_id = p_user_id
      AND d.is_archived = false
      AND c.search_vector @@ v_tsquery
      AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)
  ) r
  ORDER BY r.rank DESC
  LIMIT p_limit;
END;
$$;
