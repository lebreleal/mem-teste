
CREATE OR REPLACE FUNCTION public.bootstrap_follower_decks(
  p_user_id uuid,
  p_turma_id uuid,
  p_folder_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  td_row RECORD;
  existing_deck_id uuid;
  new_deck_id uuid;
  source_card RECORD;
  decks_created int := 0;
  decks_moved int := 0;
  cards_created int := 0;
BEGIN
  -- Loop through all published turma_decks for this turma
  FOR td_row IN
    SELECT td.id AS turma_deck_id, td.deck_id AS source_deck_id, d.name
    FROM turma_decks td
    JOIN decks d ON d.id = td.deck_id
    WHERE td.turma_id = p_turma_id
      AND td.is_published = true
  LOOP
    -- Check if user already has a deck mirroring this turma_deck
    SELECT id INTO existing_deck_id
    FROM decks
    WHERE user_id = p_user_id
      AND source_turma_deck_id = td_row.turma_deck_id
    LIMIT 1;

    IF existing_deck_id IS NOT NULL THEN
      -- LEGACY FIX: move existing deck (and its descendants) into the target folder
      UPDATE decks
      SET folder_id = p_folder_id
      WHERE id = existing_deck_id
        AND user_id = p_user_id
        AND (folder_id IS DISTINCT FROM p_folder_id);

      -- Also move any sub-decks (descendants) that belong to this user
      UPDATE decks
      SET folder_id = p_folder_id
      WHERE parent_deck_id = existing_deck_id
        AND user_id = p_user_id
        AND (folder_id IS DISTINCT FROM p_folder_id);

      decks_moved := decks_moved + 1;
    ELSE
      -- Create new mirror deck
      INSERT INTO decks (user_id, name, folder_id, source_turma_deck_id, daily_new_limit, daily_review_limit)
      VALUES (p_user_id, td_row.name, p_folder_id, td_row.turma_deck_id, 20, 9999)
      RETURNING id INTO new_deck_id;

      decks_created := decks_created + 1;

      -- Copy all cards from source deck
      FOR source_card IN
        SELECT id, front_content, back_content, card_type
        FROM cards
        WHERE deck_id = td_row.source_deck_id
      LOOP
        INSERT INTO cards (deck_id, front_content, back_content, card_type, origin_deck_id, state, stability, difficulty)
        VALUES (new_deck_id, source_card.front_content, source_card.back_content, source_card.card_type, source_card.id, 0, 0, 0);
        cards_created := cards_created + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'decks_created', decks_created,
    'decks_moved', decks_moved,
    'cards_created', cards_created
  );
END;
$$;
