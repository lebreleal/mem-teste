CREATE INDEX IF NOT EXISTS idx_cards_deck_state_sched ON public.cards (deck_id, state, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_review_logs_user_card_reviewed ON public.review_logs (user_id, card_id, reviewed_at);

CREATE OR REPLACE FUNCTION public.build_study_queue(
  p_user_id uuid,
  p_scope text,
  p_deck_id uuid DEFAULT NULL,
  p_folder_id uuid DEFAULT NULL,
  p_tz_offset_minutes integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_today date := (now() + (p_tz_offset_minutes || ' minutes')::interval)::date;
  v_end_of_today timestamptz;
  v_scope_ids uuid[];
  v_limit_scope_ids uuid[];
  v_root_id uuid;
  v_config_id uuid;
  v_config decks%ROWTYPE;
  v_is_folder_or_all boolean := (p_scope <> 'deck');
  v_zero_new_ids uuid[];
  v_review_reviewed int := 0;
  v_new_reviewed int := 0;
  v_deck_new_limit int;
  v_review_limit int;
  v_folder_review_limit int := 0;
  v_deck_remaining int := 0;
  v_effective_review_limit int := 0;
  v_bury_new boolean;
  v_bury_review boolean;
  v_bury_learning boolean;
  v_shuffle boolean;
  v_algo text;
  v_is_live boolean := false;
  v_cards jsonb := '[]'::jsonb;
  v_deck_config jsonb;
  v_scope_count int;
BEGIN
  v_end_of_today := (((v_now + (p_tz_offset_minutes || ' minutes')::interval)::date + interval '1 day') - (p_tz_offset_minutes || ' minutes')::interval);

  -- ─── Resolve scope ───
  IF p_scope = 'all' THEN
    SELECT array_agg(id) INTO v_scope_ids
    FROM decks WHERE user_id = p_user_id AND is_archived = false;
    v_limit_scope_ids := v_scope_ids;
    SELECT id INTO v_config_id
    FROM decks WHERE user_id = p_user_id AND is_archived = false AND parent_deck_id IS NULL
    ORDER BY created_at LIMIT 1;

  ELSIF p_scope = 'folder' THEN
    WITH RECURSIVE fol AS (
      SELECT id FROM folders WHERE id = p_folder_id AND user_id = p_user_id
      UNION ALL
      SELECT f.id FROM folders f JOIN fol ON f.parent_id = fol.id WHERE f.user_id = p_user_id
    ),
    roots AS (
      SELECT d.id FROM decks d
      WHERE d.user_id = p_user_id AND d.is_archived = false
        AND d.parent_deck_id IS NULL AND d.folder_id IN (SELECT id FROM fol)
    ),
    tree AS (
      SELECT id FROM roots
      UNION ALL
      SELECT d.id FROM decks d JOIN tree ON d.parent_deck_id = tree.id
      WHERE d.user_id = p_user_id AND d.is_archived = false
    )
    SELECT array_agg(DISTINCT id) INTO v_scope_ids FROM tree;
    v_limit_scope_ids := v_scope_ids;

    WITH RECURSIVE fol AS (
      SELECT id FROM folders WHERE id = p_folder_id AND user_id = p_user_id
      UNION ALL
      SELECT f.id FROM folders f JOIN fol ON f.parent_id = fol.id WHERE f.user_id = p_user_id
    )
    SELECT id INTO v_config_id
    FROM decks
    WHERE user_id = p_user_id AND is_archived = false AND parent_deck_id IS NULL
      AND folder_id IN (SELECT id FROM fol)
    ORDER BY created_at LIMIT 1;

  ELSE
    WITH RECURSIVE down AS (
      SELECT id FROM decks WHERE id = p_deck_id AND user_id = p_user_id AND is_archived = false
      UNION ALL
      SELECT d.id FROM decks d JOIN down ON d.parent_deck_id = down.id
      WHERE d.user_id = p_user_id AND d.is_archived = false
    )
    SELECT array_agg(id) INTO v_scope_ids FROM down;

    WITH RECURSIVE up AS (
      SELECT id, parent_deck_id, 0 AS depth FROM decks WHERE id = p_deck_id AND user_id = p_user_id
      UNION ALL
      SELECT d.id, d.parent_deck_id, up.depth + 1 FROM decks d JOIN up ON up.parent_deck_id = d.id
      WHERE d.user_id = p_user_id AND d.is_archived = false
    )
    SELECT id INTO v_root_id FROM up ORDER BY depth DESC LIMIT 1;
    IF v_root_id IS NULL THEN v_root_id := p_deck_id; END IF;
    v_config_id := v_root_id;

    WITH RECURSIVE downr AS (
      SELECT id FROM decks WHERE id = v_root_id AND user_id = p_user_id AND is_archived = false
      UNION ALL
      SELECT d.id FROM decks d JOIN downr ON d.parent_deck_id = downr.id
      WHERE d.user_id = p_user_id AND d.is_archived = false
    )
    SELECT array_agg(id) INTO v_limit_scope_ids FROM downr;
  END IF;

  v_scope_count := COALESCE(array_length(v_scope_ids, 1), 0);
  IF v_scope_count = 0 THEN
    RETURN jsonb_build_object('cards', '[]'::jsonb, 'algorithmMode', 'fsrs',
      'deckConfig', NULL, 'isLiveDeck', false, 'scopeDeckCount', 0);
  END IF;

  SELECT * INTO v_config FROM decks WHERE id = v_config_id;
  v_algo := COALESCE(v_config.algorithm_mode, 'fsrs');
  v_shuffle := COALESCE(v_config.shuffle_cards, false);
  v_bury_new := (v_config.bury_new_siblings IS DISTINCT FROM false);
  v_bury_review := (v_config.bury_review_siblings IS DISTINCT FROM false);
  v_bury_learning := (v_config.bury_learning_siblings IS DISTINCT FROM false);
  v_deck_new_limit := COALESCE(v_config.daily_new_limit, 20);
  v_review_limit := COALESCE(v_config.daily_review_limit, 100);

  v_deck_config := jsonb_build_object(
    'id', v_config.id, 'name', v_config.name, 'parent_deck_id', v_config.parent_deck_id,
    'folder_id', v_config.folder_id, 'daily_new_limit', v_config.daily_new_limit,
    'daily_review_limit', v_config.daily_review_limit, 'algorithm_mode', v_config.algorithm_mode,
    'learning_steps', v_config.learning_steps, 'requested_retention', v_config.requested_retention,
    'max_interval', v_config.max_interval, 'interval_modifier', v_config.interval_modifier,
    'easy_bonus', v_config.easy_bonus, 'easy_graduating_interval', v_config.easy_graduating_interval,
    'shuffle_cards', v_config.shuffle_cards, 'is_live_deck', v_config.is_live_deck,
    'source_turma_deck_id', v_config.source_turma_deck_id, 'source_listing_id', v_config.source_listing_id,
    'bury_siblings', v_config.bury_siblings, 'bury_new_siblings', v_config.bury_new_siblings,
    'bury_review_siblings', v_config.bury_review_siblings, 'bury_learning_siblings', v_config.bury_learning_siblings,
    'is_archived', v_config.is_archived
  );

  -- isLiveDeck: any scope deck or ancestor is live/community
  WITH RECURSIVE up AS (
    SELECT id, parent_deck_id, is_live_deck, source_turma_deck_id, source_listing_id
    FROM decks WHERE id = ANY(v_scope_ids)
    UNION ALL
    SELECT d.id, d.parent_deck_id, d.is_live_deck, d.source_turma_deck_id, d.source_listing_id
    FROM decks d JOIN up ON up.parent_deck_id = d.id
  )
  SELECT EXISTS (
    SELECT 1 FROM up
    WHERE is_live_deck OR source_turma_deck_id IS NOT NULL OR source_listing_id IS NOT NULL
  ) INTO v_is_live;

  -- ─── Quick review: all cards, no limits ───
  IF v_algo = 'quick_review' THEN
    SELECT COALESCE(jsonb_agg(obj ORDER BY ord), '[]'::jsonb) INTO v_cards FROM (
      SELECT jsonb_build_object(
        'id', c.id, 'deck_id', c.deck_id, 'front_content', c.front_content,
        'back_content', c.back_content, 'card_type', c.card_type, 'state', c.state,
        'stability', c.stability, 'difficulty', c.difficulty, 'scheduled_date', c.scheduled_date,
        'learning_step', c.learning_step, 'last_reviewed_at', c.last_reviewed_at,
        'origin_deck_id', c.origin_deck_id, 'created_at', c.created_at, 'last_rating', c.last_rating
      ) AS obj,
      CASE WHEN v_shuffle THEN random() ELSE extract(epoch FROM c.created_at) END AS ord
      FROM cards c WHERE c.deck_id = ANY(v_scope_ids)
    ) q;
    RETURN jsonb_build_object('cards', v_cards, 'algorithmMode', v_algo,
      'deckConfig', v_deck_config, 'isLiveDeck', v_is_live, 'scopeDeckCount', v_scope_count);
  END IF;

  -- ─── Zero-new-limit decks (deck or any active ancestor has new limit <= 0) ───
  WITH RECURSIVE up AS (
    SELECT s.id AS scope_id, d.daily_new_limit, d.parent_deck_id
    FROM unnest(v_scope_ids) s(id) JOIN decks d ON d.id = s.id
    UNION ALL
    SELECT up.scope_id, d.daily_new_limit, d.parent_deck_id
    FROM decks d JOIN up ON up.parent_deck_id = d.id
  )
  SELECT array_agg(DISTINCT scope_id) INTO v_zero_new_ids
  FROM up WHERE COALESCE(daily_new_limit, 20) <= 0;
  v_zero_new_ids := COALESCE(v_zero_new_ids, '{}');

  -- ─── Daily limits (reviewed today within limit scope) ───
  WITH lc AS (SELECT id FROM cards WHERE deck_id = ANY(v_limit_scope_ids)),
  today_reviewed AS (
    SELECT DISTINCT rl.card_id FROM review_logs rl JOIN lc ON lc.id = rl.card_id
    WHERE rl.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = v_today
  ),
  prior AS (
    SELECT DISTINCT rl.card_id FROM review_logs rl JOIN lc ON lc.id = rl.card_id
    WHERE rl.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date < v_today
  )
  SELECT
    COUNT(*) FILTER (WHERE pr.card_id IS NULL),
    COUNT(*) FILTER (WHERE pr.card_id IS NOT NULL)
  INTO v_new_reviewed, v_review_reviewed
  FROM today_reviewed tr LEFT JOIN prior pr ON pr.card_id = tr.card_id;

  IF v_is_folder_or_all THEN
    IF p_scope = 'all' THEN
      SELECT COALESCE(SUM(COALESCE(daily_review_limit, 100)), 0) INTO v_folder_review_limit
      FROM decks WHERE user_id = p_user_id AND is_archived = false AND parent_deck_id IS NULL;
    ELSE
      WITH RECURSIVE fol AS (
        SELECT id FROM folders WHERE id = p_folder_id AND user_id = p_user_id
        UNION ALL
        SELECT f.id FROM folders f JOIN fol ON f.parent_id = fol.id WHERE f.user_id = p_user_id
      )
      SELECT COALESCE(SUM(COALESCE(d.daily_review_limit, 100)), 0) INTO v_folder_review_limit
      FROM decks d
      WHERE d.user_id = p_user_id AND d.is_archived = false AND d.parent_deck_id IS NULL
        AND d.folder_id IN (SELECT id FROM fol);
    END IF;
    v_effective_review_limit := GREATEST(0, v_folder_review_limit - v_review_reviewed);
  ELSE
    v_effective_review_limit := GREATEST(0, v_review_limit - v_review_reviewed);
  END IF;

  v_deck_remaining := GREATEST(0, v_deck_new_limit - v_new_reviewed);

  -- ─── Build the ordered queue ───
  WITH RECURSIVE root_up AS (
    SELECT id AS deck_id, id AS cur, parent_deck_id, 0 AS depth
    FROM decks WHERE user_id = p_user_id AND is_archived = false
    UNION ALL
    SELECT ru.deck_id, d.id, d.parent_deck_id, ru.depth + 1
    FROM decks d JOIN root_up ru ON ru.parent_deck_id = d.id
    WHERE d.user_id = p_user_id AND d.is_archived = false
  ),
  root_map AS (
    SELECT DISTINCT ON (deck_id) deck_id, cur AS root FROM root_up ORDER BY deck_id, depth DESC
  ),
  deck_new_reviewed AS (
    SELECT c.deck_id, COUNT(DISTINCT rl.card_id) AS n
    FROM review_logs rl
    JOIN cards c ON c.id = rl.card_id
    JOIN decks d ON d.id = c.deck_id
    WHERE d.user_id = p_user_id
      AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = v_today
      AND c.state IN (1, 2, 3)
      AND NOT EXISTS (
        SELECT 1 FROM review_logs rl2
        WHERE rl2.card_id = rl.card_id
          AND (rl2.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date < v_today
      )
    GROUP BY c.deck_id
  ),
  root_reviewed AS (
    SELECT rm.root, SUM(dnr.n) AS reviewed
    FROM deck_new_reviewed dnr JOIN root_map rm ON rm.deck_id = dnr.deck_id
    GROUP BY rm.root
  ),
  due AS (
    SELECT c.id, c.deck_id, c.front_content, c.back_content, c.card_type, c.state,
           c.stability, c.difficulty, c.scheduled_date, c.learning_step,
           c.last_reviewed_at, c.origin_deck_id, c.created_at, c.last_rating
    FROM cards c
    WHERE c.deck_id = ANY(v_scope_ids)
      AND (
        (c.state = 0 AND (c.scheduled_date IS NULL OR c.scheduled_date <= v_end_of_today))
        OR (c.state IN (1, 3) AND c.scheduled_date <= v_end_of_today)
        OR (c.state = 2 AND c.scheduled_date <= v_now)
      )
  ),
  learning AS (SELECT * FROM due WHERE state IN (1, 3)),
  new_capped AS (
    SELECT d.* FROM (
      SELECT d.*,
        row_number() OVER (
          PARTITION BY (CASE WHEN v_is_folder_or_all THEN rm.root ELSE NULL END)
          ORDER BY d.created_at ASC, d.id
        ) AS rn,
        CASE WHEN v_is_folder_or_all
          THEN GREATEST(0, COALESCE(rd.daily_new_limit, 20) - COALESCE(rr.reviewed, 0))
          ELSE v_deck_remaining END AS cap
      FROM due d
      LEFT JOIN root_map rm ON rm.deck_id = d.deck_id
      LEFT JOIN decks rd ON rd.id = rm.root
      LEFT JOIN root_reviewed rr ON rr.root = rm.root
      WHERE d.state = 0 AND NOT (d.deck_id = ANY(v_zero_new_ids))
    ) d
    WHERE d.rn <= d.cap
  ),
  review_capped AS (
    SELECT d.* FROM (
      SELECT d.*, row_number() OVER (ORDER BY d.created_at ASC, d.id) AS rn
      FROM due d WHERE d.state = 2
    ) d
    WHERE d.rn <= v_effective_review_limit
  ),
  kept AS (
    SELECT l.id, l.deck_id, l.front_content, l.back_content, l.card_type, l.state,
           l.stability, l.difficulty, l.scheduled_date, l.learning_step,
           l.last_reviewed_at, l.origin_deck_id, l.created_at, l.last_rating,
           0 AS ord_grp, 0 AS bury_grp,
           (l.card_type = 'cloze' AND v_bury_learning) AS participating
    FROM learning l
    UNION ALL
    SELECT n.id, n.deck_id, n.front_content, n.back_content, n.card_type, n.state,
           n.stability, n.difficulty, n.scheduled_date, n.learning_step,
           n.last_reviewed_at, n.origin_deck_id, n.created_at, n.last_rating,
           1 AS ord_grp, 2 AS bury_grp,
           (n.card_type = 'cloze' AND v_bury_new) AS participating
    FROM new_capped n
    UNION ALL
    SELECT r.id, r.deck_id, r.front_content, r.back_content, r.card_type, r.state,
           r.stability, r.difficulty, r.scheduled_date, r.learning_step,
           r.last_reviewed_at, r.origin_deck_id, r.created_at, r.last_rating,
           2 AS ord_grp, 1 AS bury_grp,
           (r.card_type = 'cloze' AND v_bury_review) AS participating
    FROM review_capped r
  ),
  buried AS (
    SELECT k.*,
      row_number() OVER (
        PARTITION BY k.participating, k.front_content
        ORDER BY k.bury_grp, k.created_at, k.id
      ) AS brn
    FROM kept k
  ),
  survivors AS (
    SELECT * FROM buried WHERE participating = false OR brn = 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'deck_id', deck_id, 'front_content', front_content,
      'back_content', back_content, 'card_type', card_type, 'state', state,
      'stability', stability, 'difficulty', difficulty, 'scheduled_date', scheduled_date,
      'learning_step', learning_step, 'last_reviewed_at', last_reviewed_at,
      'origin_deck_id', origin_deck_id, 'created_at', created_at, 'last_rating', last_rating
    )
    ORDER BY
      CASE WHEN ord_grp = 0 THEN 0 ELSE 1 END,
      CASE WHEN ord_grp = 0 THEN extract(epoch FROM created_at) END,
      CASE WHEN ord_grp > 0 AND v_shuffle THEN random() END,
      CASE WHEN ord_grp > 0 AND NOT v_shuffle THEN ord_grp END,
      CASE WHEN ord_grp > 0 AND NOT v_shuffle THEN extract(epoch FROM created_at) END
  ), '[]'::jsonb) INTO v_cards
  FROM survivors;

  RETURN jsonb_build_object(
    'cards', v_cards,
    'algorithmMode', v_algo,
    'deckConfig', v_deck_config,
    'isLiveDeck', v_is_live,
    'scopeDeckCount', v_scope_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_study_queue(uuid, text, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_study_queue(uuid, text, uuid, uuid, integer) TO service_role;