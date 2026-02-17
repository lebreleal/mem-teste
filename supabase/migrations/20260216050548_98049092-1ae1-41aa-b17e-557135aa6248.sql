
-- 1. Batch deck stats (replaces N+1 queries)
CREATE OR REPLACE FUNCTION public.get_all_user_deck_stats(p_user_id uuid)
RETURNS TABLE(deck_id uuid, new_count bigint, learning_count bigint, review_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.deck_id,
    COUNT(*) FILTER (WHERE c.state = 0) AS new_count,
    COUNT(*) FILTER (WHERE c.state = 1) AS learning_count,
    COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS review_count
  FROM public.cards c
  JOIN public.decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
  GROUP BY c.deck_id;
$$;

-- 2. Cascade delete deck (recursive: sub-decks + cards)
CREATE OR REPLACE FUNCTION public.delete_deck_cascade(p_deck_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  -- Recursively delete sub-decks
  FOR r IN SELECT id FROM decks WHERE parent_deck_id = p_deck_id LOOP
    -- Sub-decks inherit ownership check from parent
    DELETE FROM cards WHERE deck_id = r.id;
    DELETE FROM exam_questions WHERE card_id IN (SELECT id FROM cards WHERE deck_id = r.id);
    PERFORM delete_deck_cascade(r.id);
  END LOOP;
  -- Delete cards and the deck itself
  DELETE FROM cards WHERE deck_id = p_deck_id;
  DELETE FROM decks WHERE id = p_deck_id;
END;
$$;

-- 3. Cascade delete folder (recursive: sub-folders + decks inside)
CREATE OR REPLACE FUNCTION public.delete_folder_cascade(p_folder_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (SELECT 1 FROM folders WHERE id = p_folder_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  -- Recursively delete sub-folders
  FOR r IN SELECT id FROM folders WHERE parent_id = p_folder_id LOOP
    PERFORM delete_folder_cascade(r.id);
  END LOOP;
  -- Delete all decks in this folder via cascade
  FOR r IN SELECT id FROM decks WHERE folder_id = p_folder_id LOOP
    PERFORM delete_deck_cascade(r.id);
  END LOOP;
  -- Delete the folder itself
  DELETE FROM folders WHERE id = p_folder_id;
END;
$$;
