CREATE OR REPLACE FUNCTION public.submit_review(
  p_card_id uuid,
  p_rating smallint,
  p_state integer,
  p_stability double precision,
  p_difficulty double precision,
  p_scheduled_date timestamptz,
  p_learning_step integer DEFAULT 0,
  p_elapsed_ms integer DEFAULT NULL,
  p_prev_state integer DEFAULT NULL,
  p_count_success boolean DEFAULT false,
  p_tz_offset_minutes integer DEFAULT -180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owns boolean;
  v_today date := ((now() + make_interval(mins => p_tz_offset_minutes))::date);
  v_profile record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Ownership check: the card must live in a deck owned by the caller.
  SELECT EXISTS (
    SELECT 1 FROM public.cards c
    JOIN public.decks d ON d.id = c.deck_id
    WHERE c.id = p_card_id AND d.user_id = v_user_id
  ) INTO v_owns;

  IF NOT v_owns THEN
    RAISE EXCEPTION 'card not found or not owned by caller';
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

  -- Atomic counter increments (no client read-modify-write => no lost updates).
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
         last_study_reset_date = v_today
   WHERE id = v_user_id
  RETURNING energy, successful_cards_counter, daily_cards_studied, daily_energy_earned
  INTO v_profile;

  RETURN jsonb_build_object(
    'energy', COALESCE(v_profile.energy, 0),
    'successful_cards_counter', COALESCE(v_profile.successful_cards_counter, 0),
    'daily_cards_studied', COALESCE(v_profile.daily_cards_studied, 0),
    'daily_energy_earned', COALESCE(v_profile.daily_energy_earned, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(uuid, smallint, integer, double precision, double precision, timestamptz, integer, integer, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, smallint, integer, double precision, double precision, timestamptz, integer, integer, integer, boolean, integer) TO authenticated;