-- Fix delete_deck_cascade: add missing FK cleanup for all child tables
CREATE OR REPLACE FUNCTION public.delete_deck_cascade(p_deck_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  card_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Recursively delete sub-decks first
  FOR r IN SELECT id FROM decks WHERE parent_deck_id = p_deck_id LOOP
    PERFORM delete_deck_cascade(r.id);
  END LOOP;

  -- Collect card IDs for this deck
  SELECT array_agg(id) INTO card_ids FROM cards WHERE deck_id = p_deck_id;

  -- Delete card-level FK references
  IF card_ids IS NOT NULL AND array_length(card_ids, 1) > 0 THEN
    DELETE FROM card_bookmarks WHERE card_id = ANY(card_ids);
    DELETE FROM card_tags WHERE card_id = ANY(card_ids);
    DELETE FROM concept_cards WHERE card_id = ANY(card_ids);
    DELETE FROM review_logs WHERE card_id = ANY(card_ids);
    DELETE FROM exam_questions WHERE card_id = ANY(card_ids);
    DELETE FROM deck_suggestions WHERE card_id = ANY(card_ids);
    -- user_card_metadata if exists
    BEGIN
      EXECUTE 'DELETE FROM user_card_metadata WHERE card_id = ANY($1)' USING card_ids;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END IF;

  -- Delete deck-level FK references
  DELETE FROM deck_suggestions WHERE deck_id = p_deck_id;
  DELETE FROM deck_tags WHERE deck_id = p_deck_id;
  DELETE FROM deck_questions WHERE deck_id = p_deck_id;
  DELETE FROM deck_concept_mastery WHERE deck_id = p_deck_id;
  DELETE FROM deck_concepts WHERE deck_id = p_deck_id;
  DELETE FROM turma_decks WHERE deck_id = p_deck_id;
  DELETE FROM exam_questions WHERE exam_id IN (SELECT id FROM exams WHERE deck_id = p_deck_id);
  DELETE FROM exams WHERE deck_id = p_deck_id;
  DELETE FROM marketplace_listings WHERE deck_id = p_deck_id;

  -- Delete cards and the deck itself
  DELETE FROM cards WHERE deck_id = p_deck_id;
  DELETE FROM decks WHERE id = p_deck_id;
END;
$function$;