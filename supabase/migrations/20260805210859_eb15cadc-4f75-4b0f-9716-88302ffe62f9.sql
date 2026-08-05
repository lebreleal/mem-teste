-- 1) Official server-side streak computation (local day = UTC-3 by default)
CREATE OR REPLACE FUNCTION public.compute_user_streak(p_user_id uuid, p_tz_offset_minutes integer DEFAULT -180)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := ((now() + make_interval(mins => p_tz_offset_minutes))::date);
  v_cursor date;
  v_streak integer := 0;
  v_has_today boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.review_logs r
    WHERE r.user_id = p_user_id
      AND ((r.reviewed_at + make_interval(mins => p_tz_offset_minutes))::date) = v_today
  ) INTO v_has_today;

  v_cursor := CASE WHEN v_has_today THEN v_today ELSE v_today - 1 END;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.review_logs r
      WHERE r.user_id = p_user_id
        AND ((r.reviewed_at + make_interval(mins => p_tz_offset_minutes))::date) = v_cursor
    );
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
    EXIT WHEN v_streak >= 3650;
  END LOOP;

  RETURN v_streak;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_user_streak(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_user_streak(uuid, integer) TO authenticated, service_role;

-- 2) submit_review now maintains current_streak incrementally (only on the first review of the day)
CREATE OR REPLACE FUNCTION public.submit_review(p_card_id uuid, p_rating smallint, p_state integer, p_stability double precision, p_difficulty double precision, p_scheduled_date timestamp with time zone, p_learning_step integer DEFAULT 0, p_elapsed_ms integer DEFAULT NULL::integer, p_prev_state integer DEFAULT NULL::integer, p_count_success boolean DEFAULT false, p_tz_offset_minutes integer DEFAULT '-180'::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owns boolean;
  v_today date := ((now() + make_interval(mins => p_tz_offset_minutes))::date);
  v_profile record;
  v_first_today boolean;
  v_studied_yesterday boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cards c
    JOIN public.decks d ON d.id = c.deck_id
    WHERE c.id = p_card_id AND d.user_id = v_user_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RAISE EXCEPTION 'card not found or not owned by caller';
  END IF;

  -- Was there already a review logged today (local day)? Decided BEFORE inserting the new log.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.review_logs r
    WHERE r.user_id = v_user_id
      AND ((r.reviewed_at + make_interval(mins => p_tz_offset_minutes))::date) = v_today
  ) INTO v_first_today;

  IF v_first_today THEN
    SELECT EXISTS (
      SELECT 1 FROM public.review_logs r
      WHERE r.user_id = v_user_id
        AND ((r.reviewed_at + make_interval(mins => p_tz_offset_minutes))::date) = v_today - 1
    ) INTO v_studied_yesterday;
  END IF;

  UPDATE public.cards
     SET state = p_state,
         stability = p_stability,
         difficulty = p_difficulty,
         scheduled_date = p_scheduled_date,
         learning_step = COALESCE(p_learning_step, 0),
         last_rating = p_rating,
         last_reviewed_at = now()
   WHERE id = p_card_id;

  INSERT INTO public.review_logs (
    user_id, card_id, rating, stability, difficulty, scheduled_date, state, elapsed_ms
  ) VALUES (
    v_user_id, p_card_id, p_rating, p_stability, p_difficulty,
    p_scheduled_date, COALESCE(p_prev_state, p_state), p_elapsed_ms
  );

  UPDATE public.profiles
     SET daily_cards_studied = CASE
           WHEN last_study_reset_date IS DISTINCT FROM v_today THEN 1
           ELSE COALESCE(daily_cards_studied, 0) + 1
         END,
         daily_energy_earned = CASE
           WHEN last_study_reset_date IS DISTINCT FROM v_today THEN 0
           ELSE COALESCE(daily_energy_earned, 0)
         END,
         successful_cards_counter = CASE
           WHEN NOT p_count_success THEN COALESCE(successful_cards_counter, 0)
           WHEN COALESCE(successful_cards_counter, 0) + 1 >= 10 THEN 0
           ELSE COALESCE(successful_cards_counter, 0) + 1
         END,
         current_streak = CASE
           WHEN NOT v_first_today THEN GREATEST(COALESCE(current_streak, 0), 1)
           WHEN v_studied_yesterday THEN COALESCE(current_streak, 0) + 1
           ELSE 1
         END,
         last_study_reset_date = v_today
   WHERE id = v_user_id
  RETURNING energy, successful_cards_counter, daily_cards_studied, daily_energy_earned, current_streak
  INTO v_profile;

  RETURN jsonb_build_object(
    'energy', COALESCE(v_profile.energy, 0),
    'successful_cards_counter', COALESCE(v_profile.successful_cards_counter, 0),
    'daily_cards_studied', COALESCE(v_profile.daily_cards_studied, 0),
    'daily_energy_earned', COALESCE(v_profile.daily_energy_earned, 0),
    'current_streak', COALESCE(v_profile.current_streak, 0)
  );
END;
$$;

-- 3) Backfill every existing profile from the real review history
UPDATE public.profiles p
   SET current_streak = public.compute_user_streak(p.id, -180),
       updated_at = now()
 WHERE COALESCE(p.current_streak, 0) IS DISTINCT FROM public.compute_user_streak(p.id, -180);