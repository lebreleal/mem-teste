
CREATE OR REPLACE FUNCTION public.get_activity_daily_breakdown(
  p_user_id uuid,
  p_tz_offset_minutes integer DEFAULT 0,
  p_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_day_map jsonb := '{}'::jsonb;
  v_streak integer;
  v_freezes_available integer;
  v_freezes_used integer;
  v_frozen_days text[];
  v_best_streak integer := 0;
  v_current_run integer := 0;
  v_total_active_days integer;
  v_unique_days text[];
  v_sorted_days text[];
  v_today_key text;
  v_check_date date;
  v_day_key text;
  v_studied boolean;
  v_consecutive_gaps integer := 0;
  v_entries_studied integer := 0;
  v_entries_gaps integer := 0;
  v_entries_total integer := 0;
  v_total_freezes integer;
  v_gap_keys text[] := '{}';
  v_today date;
  v_prev_day text;
  v_diff numeric;
BEGIN
  v_today := (now() + (p_tz_offset_minutes || ' minutes')::interval)::date;

  -- Aggregate daily stats directly in SQL
  SELECT jsonb_object_agg(day_key, day_data)
  INTO v_day_map
  FROM (
    SELECT
      day_key,
      jsonb_build_object(
        'date', day_key,
        'cards', COUNT(*),
        'minutes', GREATEST(1, ROUND(SUM(
          CASE
            WHEN rl.elapsed_ms IS NOT NULL AND rl.elapsed_ms >= 1500 AND rl.elapsed_ms <= 120000
              THEN rl.elapsed_ms
            ELSE 15000
          END
        ) / 60000.0))::integer,
        'newCards', COUNT(*) FILTER (WHERE rl.state = 0),
        'learning', COUNT(*) FILTER (WHERE rl.state = 1),
        'review', COUNT(*) FILTER (WHERE rl.state = 2),
        'relearning', COUNT(*) FILTER (WHERE rl.state = 3)
      ) AS day_data
    FROM (
      SELECT
        rl.*,
        ((rl.reviewed_at + (p_tz_offset_minutes || ' minutes')::interval)::date)::text AS day_key
      FROM review_logs rl
      WHERE rl.user_id = p_user_id
        AND rl.reviewed_at >= now() - (p_days || ' days')::interval
    ) rl
    GROUP BY day_key
  ) agg;

  IF v_day_map IS NULL THEN
    v_day_map := '{}'::jsonb;
  END IF;

  -- Get unique study days
  SELECT ARRAY_AGG(key ORDER BY key)
  INTO v_sorted_days
  FROM jsonb_object_keys(v_day_map) AS key;

  v_total_active_days := COALESCE(array_length(v_sorted_days, 1), 0);

  IF v_total_active_days = 0 THEN
    RETURN jsonb_build_object(
      'dayMap', v_day_map,
      'streak', 0, 'bestStreak', 0,
      'totalActiveDays', 0,
      'freezesAvailable', 0, 'freezesUsed', 0,
      'frozenDays', '[]'::jsonb
    );
  END IF;

  -- Best streak (simple, no freezes)
  v_best_streak := 1;
  v_current_run := 1;
  FOR i IN 2..v_total_active_days LOOP
    v_diff := (v_sorted_days[i]::date - v_sorted_days[i-1]::date);
    IF v_diff = 1 THEN
      v_current_run := v_current_run + 1;
    ELSE
      IF v_current_run > v_best_streak THEN v_best_streak := v_current_run; END IF;
      v_current_run := 1;
    END IF;
  END LOOP;
  IF v_current_run > v_best_streak THEN v_best_streak := v_current_run; END IF;

  -- Streak with freezes (same algorithm as JS)
  v_unique_days := v_sorted_days;
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
      v_gap_keys := array_append(v_gap_keys, v_day_key);
      v_entries_gaps := v_entries_gaps + 1;
      v_entries_total := v_entries_total + 1;
    END IF;
  END LOOP;

  -- Remove trailing gap
  IF v_entries_total > 0 THEN
    v_day_key := (v_check_date - (v_entries_total - 1))::text;
    IF NOT (v_day_key = ANY(v_unique_days)) THEN
      v_entries_gaps := v_entries_gaps - 1;
      v_entries_total := v_entries_total - 1;
      v_gap_keys := v_gap_keys[1:array_length(v_gap_keys,1)-1];
    END IF;
  END IF;

  v_total_freezes := v_entries_studied / 7;

  IF v_total_freezes >= v_entries_gaps THEN
    v_streak := v_entries_total;
    v_freezes_available := v_total_freezes - v_entries_gaps;
    v_freezes_used := v_entries_gaps;
    v_frozen_days := v_gap_keys;
  ELSE
    -- Simplified: streak = studied + min(freezes, gaps)
    v_freezes_used := LEAST(v_total_freezes, v_entries_gaps);
    v_streak := v_entries_studied + v_freezes_used;
    v_freezes_available := GREATEST(0, v_total_freezes - v_entries_gaps);
    v_frozen_days := v_gap_keys[1:v_freezes_used];
  END IF;

  RETURN jsonb_build_object(
    'dayMap', v_day_map,
    'streak', v_streak,
    'bestStreak', v_best_streak,
    'totalActiveDays', v_total_active_days,
    'freezesAvailable', v_freezes_available,
    'freezesUsed', v_freezes_used,
    'frozenDays', to_jsonb(COALESCE(v_frozen_days, '{}'))
  );
END;
$$;
