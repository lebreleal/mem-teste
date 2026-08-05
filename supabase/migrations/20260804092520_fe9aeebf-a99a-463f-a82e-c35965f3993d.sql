CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_tz_offset_minutes integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  WITH stats AS (
    SELECT * FROM public.get_all_user_deck_stats(v_user, p_tz_offset_minutes)
  ),
  counts AS (
    SELECT * FROM public.get_all_user_card_counts(v_user)
  ),
  base AS (
    SELECT d.* FROM public.decks d WHERE d.user_id = v_user
  ),
  listing_author AS (
    SELECT ml.id AS listing_id, p.name AS author
    FROM public.marketplace_listings ml
    LEFT JOIN public.profiles p ON p.id = ml.seller_id
    WHERE ml.id IN (SELECT source_listing_id FROM base WHERE source_listing_id IS NOT NULL)
  ),
  turma_author AS (
    SELECT td.id AS turma_deck_id, p.name AS author, sd.updated_at AS source_updated_at
    FROM public.turma_decks td
    LEFT JOIN public.profiles p ON p.id = td.shared_by
    LEFT JOIN public.decks sd ON sd.id = td.deck_id
    WHERE td.id IN (SELECT source_turma_deck_id FROM base WHERE source_turma_deck_id IS NOT NULL)
  ),
  orphan_author AS (
    SELECT DISTINCT ON (od.name) od.name, p.name AS author, od.updated_at AS source_updated_at
    FROM public.decks od
    LEFT JOIN public.profiles p ON p.id = od.user_id
    WHERE od.is_live_deck = false
      AND od.user_id <> v_user
      AND od.name IN (
        SELECT name FROM base
        WHERE is_live_deck AND source_turma_deck_id IS NULL AND source_listing_id IS NULL
      )
    ORDER BY od.name, od.updated_at DESC
  ),
  decks_json AS (
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_order NULLS LAST, x.created_at DESC) AS arr
    FROM (
      SELECT
        b.id, b.name, b.parent_deck_id, b.folder_id, b.user_id,
        COALESCE(b.daily_new_limit, 20) AS daily_new_limit,
        COALESCE(b.daily_review_limit, 100) AS daily_review_limit,
        b.algorithm_mode, b.learning_steps, b.requested_retention, b.max_interval,
        b.interval_modifier, b.easy_bonus, b.easy_graduating_interval, b.shuffle_cards,
        b.is_live_deck, b.source_turma_deck_id, b.source_listing_id,
        b.bury_siblings, b.bury_new_siblings, b.bury_review_siblings, b.bury_learning_siblings,
        COALESCE(b.is_archived, false) AS is_archived,
        b.is_public, b.is_free_in_community, b.community_id, b.sort_order,
        b.allow_duplication, b.synced_at, b.created_at,
        COALESCE(b.updated_at, b.created_at) AS updated_at,
        COALESCE(s.new_count, 0)::int AS new_count,
        COALESCE(s.learning_count, 0)::int AS learning_count,
        COALESCE(s.review_count, 0)::int AS review_count,
        COALESCE(s.reviewed_today, 0)::int AS reviewed_today,
        COALESCE(s.new_reviewed_today, 0)::int AS new_reviewed_today,
        COALESCE(s.new_graduated_today, 0)::int AS new_graduated_today,
        COALESCE(c.total, 0)::int AS total_cards,
        COALESCE(c.mastered, 0)::int AS mastered_cards,
        COALESCE(c.novo, 0)::int AS class_novo,
        COALESCE(c.facil, 0)::int AS class_facil,
        COALESCE(c.bom, 0)::int AS class_bom,
        COALESCE(c.dificil, 0)::int AS class_dificil,
        COALESCE(c.errei, 0)::int AS class_errei,
        COALESCE(la.author, ta.author, oa.author) AS source_author,
        COALESCE(ta.source_updated_at, CASE WHEN b.is_live_deck THEN oa.source_updated_at END) AS source_updated_at
      FROM base b
      LEFT JOIN stats s ON s.deck_id = b.id
      LEFT JOIN counts c ON c.deck_id = b.id
      LEFT JOIN listing_author la ON la.listing_id = b.source_listing_id
      LEFT JOIN turma_author ta ON ta.turma_deck_id = b.source_turma_deck_id
      LEFT JOIN orphan_author oa ON b.is_live_deck AND oa.name = b.name
    ) x
  ),
  folders_json AS (
    SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.sort_order NULLS LAST, f.name) AS arr
    FROM (
      SELECT id, name, parent_id, is_archived, created_at, updated_at, user_id, section,
             source_turma_id, source_turma_subject_id, image_url, sort_order
      FROM public.folders WHERE user_id = v_user
    ) f
  ),
  profile_json AS (
    SELECT row_to_json(p)::jsonb AS obj
    FROM (
      SELECT id, energy, successful_cards_counter, daily_cards_studied, daily_energy_earned,
             daily_new_cards_limit, daily_study_minutes, last_energy_recharge,
             last_study_reset_date, created_at, weekly_new_cards, weekly_study_minutes,
             is_profile_public, current_streak
      FROM public.profiles WHERE id = v_user
    ) p
  )
  SELECT jsonb_build_object(
    'profile', (SELECT obj FROM profile_json),
    'folders', COALESCE((SELECT arr FROM folders_json), '[]'::jsonb),
    'decks', COALESCE((SELECT arr FROM decks_json), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(integer) TO authenticated;