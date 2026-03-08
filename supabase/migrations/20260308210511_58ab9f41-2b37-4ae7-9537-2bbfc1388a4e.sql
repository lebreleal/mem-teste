
CREATE OR REPLACE FUNCTION public.get_study_stats_summary(
  p_user_id uuid,
  p_tz_offset_minutes integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile RECORD;
  v_today date;
  v_last_study_date timestamptz;
  v_streak integer := 0;
  v_freezes_available integer := 0;
  v_today_minutes integer := 0;
  v_avg_minutes_7d integer := 0;
  v_today_cards integer := 0;
  v_energy integer := 0;
  v_daily_energy_earned integer := 0;
  v_mascot_state text := 'sleeping';
  -- streak calculation vars
  v_unique_days text[];
  v_today_key text;
  v_check_date date;
  v_consecutive_gaps integer := 0;
  v_day_key text;
  v_studied boolean;
  v_entries_studied integer := 0;
  v_entries_gaps integer := 0;
  v_entries_total integer := 0;
  v_total_freezes integer;
  v_days_since integer;
BEGIN
  -- Fetch profile
  SELECT energy, daily_energy_earned, last_study_reset_date, daily_cards_studied, created_at
  INTO v_profile
  FROM profiles WHERE id = p_user_id;

  v_today := (now() + (p_tz_offset_minutes || ' minutes')::interval)::date;
  v_energy := COALESCE(v_profile.energy, 0);
  v_daily_energy_earned := CASE WHEN v_profile.last_study_reset_date = v_today::text THEN COALESCE(v_profile.daily_energy_earned, 0) ELSE 0 END;
  v_today_cards := CASE WHEN v_profile.last_study_reset_date = v_today::text THEN COALESCE(v_profile.daily_cards_studied, 0) ELSE 0 END;

  -- Get unique study days (using user's local timezone)
  SELECT ARRAY_AGG(DISTINCT (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date::text)
  INTO v_unique_days
  FROM review_logs rl
  WHERE rl.user_id = p_user_id
    AND rl.reviewed_at >= now() - interval '730 days';

  IF v_unique_days IS NULL OR array_length(v_unique_days, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'streak', 0, 'freezes_available', 0,
      'today_minutes', 0, 'avg_minutes_7d', 0,
      'today_cards', v_today_cards, 'energy', v_energy,
      'daily_energy_earned', v_daily_energy_earned,
      'mascot_state', 'sleeping',
      'last_study_date', NULL
    );
  END IF;

  -- Get last study date
  SELECT MAX(rl.reviewed_at) INTO v_last_study_date
  FROM review_logs rl WHERE rl.user_id = p_user_id;

  -- Mascot state
  v_days_since := EXTRACT(day FROM (now() - v_last_study_date));
  IF v_days_since <= 2 THEN v_mascot_state := 'happy';
  ELSIF v_days_since <= 5 THEN v_mascot_state := 'tired';
  ELSE v_mascot_state := 'sleeping';
  END IF;

  -- Streak calculation (replicate JS logic)
  v_today_key := v_today::text;
  v_check_date := v_today;
  IF NOT (v_today_key = ANY(v_unique_days)) THEN
    v_check_date := v_today - 1;
  END IF;

  v_consecutive_gaps := 0;
  FOR i IN 0..729 LOOP
    v_day_key := (v_check_date - i)::text;
    v_studied := v_day_key = ANY(v_unique_days);

    IF v_studied THEN
      v_consecutive_gaps := 0;
      v_entries_studied := v_entries_studied + 1;
      v_entries_total := v_entries_total + 1;
    ELSE
      v_consecutive_gaps := v_consecutive_gaps + 1;
      IF v_consecutive_gaps >= 2 THEN EXIT; END IF;
      v_entries_gaps := v_entries_gaps + 1;
      v_entries_total := v_entries_total + 1;
    END IF;
  END LOOP;

  -- Remove trailing gap (if last entry added was a gap)
  -- We check by re-checking the last added entry
  IF v_entries_total > 0 THEN
    v_day_key := (v_check_date - (v_entries_total - 1))::text;
    IF NOT (v_day_key = ANY(v_unique_days)) THEN
      v_entries_gaps := v_entries_gaps - 1;
      v_entries_total := v_entries_total - 1;
    END IF;
  END IF;

  v_total_freezes := v_entries_studied / 7;

  IF v_total_freezes >= v_entries_gaps THEN
    v_streak := v_entries_total;
    v_freezes_available := v_total_freezes - v_entries_gaps;
  ELSE
    -- Trim from oldest until balanced (simplified: just count studied + affordable gaps)
    -- Re-walk to find the correct trimmed streak
    v_streak := v_entries_studied;
    v_freezes_available := 0;
    -- Simple approximation: streak = studied days + min(freezes, gaps)
    IF v_total_freezes > 0 THEN
      v_streak := v_entries_studied + LEAST(v_total_freezes, v_entries_gaps);
      v_freezes_available := GREATEST(0, v_total_freezes - v_entries_gaps);
    END IF;
  END IF;

  -- Today's study minutes (using elapsed_ms where available, otherwise estimate)
  SELECT GREATEST(1, ROUND(COALESCE(SUM(
    CASE
      WHEN rl.elapsed_ms IS NOT NULL AND rl.elapsed_ms >= 1500 AND rl.elapsed_ms <= 120000
        THEN rl.elapsed_ms
      ELSE 15000 -- fallback estimate per card
    END
  ), 0) / 60000.0))::integer
  INTO v_today_minutes
  FROM review_logs rl
  WHERE rl.user_id = p_user_id
    AND (rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = v_today;

  IF v_today_minutes IS NULL OR NOT EXISTS (
    SELECT 1 FROM review_logs WHERE user_id = p_user_id
    AND (reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date = v_today
  ) THEN
    v_today_minutes := 0;
  END IF;

  -- 7-day average minutes
  DECLARE
    v_7d_total integer;
    v_active_days integer;
    v_account_age integer;
  BEGIN
    SELECT GREATEST(1, ROUND(COALESCE(SUM(
      CASE
        WHEN rl.elapsed_ms IS NOT NULL AND rl.elapsed_ms >= 1500 AND rl.elapsed_ms <= 120000
          THEN rl.elapsed_ms
        ELSE 15000
      END
    ), 0) / 60000.0))::integer
    INTO v_7d_total
    FROM review_logs rl
    WHERE rl.user_id = p_user_id
      AND rl.reviewed_at >= now() - interval '7 days';

    IF NOT EXISTS (SELECT 1 FROM review_logs WHERE user_id = p_user_id AND reviewed_at >= now() - interval '7 days') THEN
      v_7d_total := 0;
    END IF;

    v_account_age := GREATEST(1, EXTRACT(day FROM (now() - v_profile.created_at))::integer);
    v_active_days := LEAST(v_account_age, 7);
    v_avg_minutes_7d := CASE WHEN v_7d_total > 0 THEN GREATEST(1, ROUND(v_7d_total::numeric / v_active_days)) ELSE 0 END;
  END;

  RETURN jsonb_build_object(
    'streak', v_streak,
    'freezes_available', v_freezes_available,
    'today_minutes', v_today_minutes,
    'avg_minutes_7d', v_avg_minutes_7d,
    'today_cards', v_today_cards,
    'energy', v_energy,
    'daily_energy_earned', v_daily_energy_earned,
    'mascot_state', v_mascot_state,
    'last_study_date', v_last_study_date
  );
END;
$$;
