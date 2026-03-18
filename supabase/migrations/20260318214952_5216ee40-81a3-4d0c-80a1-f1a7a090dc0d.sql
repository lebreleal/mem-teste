
-- 1. Helper: strip HTML tags from text
CREATE OR REPLACE FUNCTION public.strip_html(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT regexp_replace(
    regexp_replace(p_text, '<[^>]+>', ' ', 'g'),
    '\s+', ' ', 'g'
  );
$$;

-- 2. Add search_vector column to cards
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Add search_vector column to decks
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 4. Trigger function for cards
CREATE OR REPLACE FUNCTION public.cards_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', coalesce(public.strip_html(NEW.front_content), '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(public.strip_html(NEW.back_content), '')), 'B');
  RETURN NEW;
END;
$$;

-- 5. Trigger function for decks
CREATE OR REPLACE FUNCTION public.decks_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('portuguese', coalesce(NEW.name, ''));
  RETURN NEW;
END;
$$;

-- 6. Create triggers
DROP TRIGGER IF EXISTS cards_search_vector_trigger ON public.cards;
CREATE TRIGGER cards_search_vector_trigger
  BEFORE INSERT OR UPDATE OF front_content, back_content ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.cards_search_vector_update();

DROP TRIGGER IF EXISTS decks_search_vector_trigger ON public.decks;
CREATE TRIGGER decks_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.decks_search_vector_update();

-- 7. GIN indexes
CREATE INDEX IF NOT EXISTS idx_cards_search_vector ON public.cards USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_decks_search_vector ON public.decks USING gin(search_vector);

-- 8. Backfill existing data
UPDATE public.cards SET search_vector =
  setweight(to_tsvector('portuguese', coalesce(public.strip_html(front_content), '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce(public.strip_html(back_content), '')), 'B')
WHERE search_vector IS NULL;

UPDATE public.decks SET search_vector =
  to_tsvector('portuguese', coalesce(name, ''))
WHERE search_vector IS NULL;

-- 9. RPC for global search
CREATE OR REPLACE FUNCTION public.search_user_content(
  p_user_id uuid,
  p_query text,
  p_folder_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE(
  result_type text,
  deck_id uuid,
  deck_name text,
  parent_deck_name text,
  folder_name text,
  card_id uuid,
  snippet text,
  rank real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tsquery tsquery;
  v_raw text;
BEGIN
  -- Build tsquery from user input
  v_raw := trim(p_query);
  IF length(v_raw) < 2 THEN
    RETURN;
  END IF;

  -- Try websearch first, fallback to plainto if it fails
  BEGIN
    v_tsquery := websearch_to_tsquery('portuguese', v_raw);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('portuguese', v_raw);
  END;

  -- Search decks
  RETURN QUERY
  SELECT
    'deck'::text AS result_type,
    d.id AS deck_id,
    d.name AS deck_name,
    pd.name AS parent_deck_name,
    f.name AS folder_name,
    NULL::uuid AS card_id,
    ts_headline('portuguese', d.name, v_tsquery,
      'StartSel=<b>, StopSel=</b>, MaxWords=50, MinWords=20') AS snippet,
    ts_rank(d.search_vector, v_tsquery) AS rank
  FROM decks d
  LEFT JOIN decks pd ON pd.id = d.parent_deck_id
  LEFT JOIN folders f ON f.id = d.folder_id
  WHERE d.user_id = p_user_id
    AND d.is_archived = false
    AND d.search_vector @@ v_tsquery
    AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)
  ORDER BY rank DESC
  LIMIT p_limit;

  -- Search cards
  RETURN QUERY
  SELECT
    'card'::text AS result_type,
    c.deck_id AS deck_id,
    d2.name AS deck_name,
    pd2.name AS parent_deck_name,
    f2.name AS folder_name,
    c.id AS card_id,
    ts_headline('portuguese', public.strip_html(c.front_content || ' ' || c.back_content), v_tsquery,
      'StartSel=<b>, StopSel=</b>, MaxWords=40, MinWords=15') AS snippet,
    ts_rank(c.search_vector, v_tsquery) AS rank
  FROM cards c
  JOIN decks d2 ON d2.id = c.deck_id
  LEFT JOIN decks pd2 ON pd2.id = d2.parent_deck_id
  LEFT JOIN folders f2 ON f2.id = d2.folder_id
  WHERE d2.user_id = p_user_id
    AND d2.is_archived = false
    AND c.search_vector @@ v_tsquery
    AND (p_folder_id IS NULL OR d2.folder_id = p_folder_id)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;
