CREATE OR REPLACE FUNCTION public.resolve_community_deck_source(p_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deck RECORD;
  v_author_name text;
  v_updated_at timestamptz;
  v_td RECORD;
  v_orig RECORD;
  v_listing RECORD;
BEGIN
  SELECT source_turma_deck_id, source_listing_id, is_live_deck, name, user_id
  INTO v_deck
  FROM decks WHERE id = p_deck_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT v_deck.is_live_deck AND v_deck.source_turma_deck_id IS NULL AND v_deck.source_listing_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_deck.source_turma_deck_id IS NOT NULL THEN
    SELECT td.shared_by, td.deck_id INTO v_td
    FROM turma_decks td WHERE td.id = v_deck.source_turma_deck_id;
    IF FOUND THEN
      SELECT p.name INTO v_author_name FROM profiles p WHERE p.id = v_td.shared_by;
      SELECT d.updated_at INTO v_updated_at FROM decks d WHERE d.id = v_td.deck_id;
    END IF;

  ELSIF v_deck.source_listing_id IS NOT NULL THEN
    SELECT ml.seller_id, ml.deck_id INTO v_listing
    FROM marketplace_listings ml WHERE ml.id = v_deck.source_listing_id;
    IF FOUND THEN
      SELECT p.name INTO v_author_name FROM profiles p WHERE p.id = v_listing.seller_id;
      SELECT d.updated_at INTO v_updated_at FROM decks d WHERE d.id = v_listing.deck_id;
    END IF;

  ELSIF v_deck.is_live_deck THEN
    SELECT td.shared_by, td.deck_id INTO v_td
    FROM turma_decks td WHERE td.deck_id = p_deck_id
    LIMIT 1;
    
    IF FOUND THEN
      SELECT p.name INTO v_author_name FROM profiles p WHERE p.id = v_td.shared_by;
      SELECT d.updated_at INTO v_updated_at FROM decks d WHERE d.id = v_td.deck_id;
    ELSE
      SELECT d.user_id, d.updated_at INTO v_orig
      FROM decks d
      WHERE d.name = v_deck.name
        AND d.user_id != v_deck.user_id
        AND d.is_live_deck = false
      ORDER BY d.created_at ASC
      LIMIT 1;
      
      IF FOUND THEN
        SELECT p.name INTO v_author_name FROM profiles p WHERE p.id = v_orig.user_id;
        v_updated_at := v_orig.updated_at;
      END IF;
    END IF;
  END IF;

  IF v_author_name IS NULL AND v_updated_at IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'authorName', v_author_name,
    'updatedAt', v_updated_at
  );
END;
$$;