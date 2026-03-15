CREATE OR REPLACE FUNCTION public.bootstrap_follower_decks(p_user_id uuid, p_turma_id uuid, p_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_td record;
  v_new_deck_id uuid;
  v_card_count int := 0;
  v_deck_count int := 0;
  v_child record;
  v_new_child_id uuid;
  v_rows int;
BEGIN
  -- Security: ensure caller can only bootstrap for themselves
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized: p_user_id must match authenticated user';
  END IF;

  FOR v_td IN
    SELECT td.id as turma_deck_id, td.deck_id, d.name, d.daily_new_limit, d.daily_review_limit, 
           d.algorithm_mode, d.learning_steps, d.requested_retention, d.max_interval,
           d.shuffle_cards, d.sort_order
    FROM turma_decks td
    JOIN decks d ON d.id = td.deck_id
    WHERE td.turma_id = p_turma_id AND td.is_published = true
  LOOP
    IF EXISTS (
      SELECT 1 FROM decks 
      WHERE user_id = p_user_id AND source_turma_deck_id = v_td.turma_deck_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO decks (
      user_id, name, folder_id, source_turma_deck_id, 
      daily_new_limit, daily_review_limit, algorithm_mode, learning_steps,
      requested_retention, max_interval, shuffle_cards, sort_order, is_public
    ) VALUES (
      p_user_id, v_td.name, p_folder_id, v_td.turma_deck_id,
      v_td.daily_new_limit, v_td.daily_review_limit, v_td.algorithm_mode, v_td.learning_steps,
      v_td.requested_retention, v_td.max_interval, v_td.shuffle_cards, v_td.sort_order, false
    ) RETURNING id INTO v_new_deck_id;
    
    v_deck_count := v_deck_count + 1;

    INSERT INTO cards (deck_id, front_content, back_content, card_type, origin_deck_id)
    SELECT v_new_deck_id, c.front_content, c.back_content, c.card_type, c.id
    FROM cards c
    WHERE c.deck_id = v_td.deck_id;
    
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_card_count := v_card_count + v_rows;

    FOR v_child IN
      SELECT id, name, daily_new_limit, daily_review_limit, algorithm_mode, 
             learning_steps, requested_retention, max_interval, shuffle_cards, sort_order
      FROM decks
      WHERE parent_deck_id = v_td.deck_id AND is_archived = false
    LOOP
      INSERT INTO decks (
        user_id, name, folder_id, parent_deck_id,
        daily_new_limit, daily_review_limit, algorithm_mode, learning_steps,
        requested_retention, max_interval, shuffle_cards, sort_order, is_public
      ) VALUES (
        p_user_id, v_child.name, p_folder_id, v_new_deck_id,
        v_child.daily_new_limit, v_child.daily_review_limit, v_child.algorithm_mode, v_child.learning_steps,
        v_child.requested_retention, v_child.max_interval, v_child.shuffle_cards, v_child.sort_order, false
      ) RETURNING id INTO v_new_child_id;
      
      v_deck_count := v_deck_count + 1;

      INSERT INTO cards (deck_id, front_content, back_content, card_type, origin_deck_id)
      SELECT v_new_child_id, c.front_content, c.back_content, c.card_type, c.id
      FROM cards c
      WHERE c.deck_id = v_child.id;
      
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_card_count := v_card_count + v_rows;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('decks_created', v_deck_count, 'cards_created', v_card_count);
END;
$function$;