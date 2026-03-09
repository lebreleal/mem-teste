CREATE OR REPLACE FUNCTION public.get_user_ranking()
RETURNS TABLE(user_id uuid, user_name text, cards_30d bigint, minutes_30d bigint, current_streak integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  v_sorted_days text[];
  v_today date;
  v_check_date date;
  v_day_key text;
  v_studied boolean;
  v_consecutive_gaps integer;
  v_entries_studied integer;
  v_entries_gaps integer;
  v_entries_total integer;
  v_total_freezes integer;
  v_streak integer;
  v_total_active_days integer;
BEGIN
  v_today := current_date;

  FOR rec IN
    SELECT
      p.id AS uid,
      p.name AS uname,
      COALESCE(r.c30, 0)::bigint AS c30,
      COALESCE(r.m30, 0)::bigint AS m30
    FROM profiles p
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::bigint AS c30,
        (COALESCE(SUM(LEAST(GREATEST(rl.elapsed_ms, 1500), 120000)), 0) / 60000)::bigint AS m30
      FROM review_logs rl
      WHERE rl.user_id = p.id
        AND rl.reviewed_at >= NOW() - INTERVAL '30 days'
    ) r ON true
    WHERE p.is_profile_public = true
    ORDER BY COALESCE(r.c30, 0) DESC
    LIMIT 50
  LOOP
    SELECT ARRAY_AGG(DISTINCT (rl.reviewed_at::date)::text ORDER BY (rl.reviewed_at::date)::text)
    INTO v_sorted_days
    FROM review_logs rl
    WHERE rl.user_id = rec.uid
      AND rl.reviewed_at >= now() - interval '730 days';

    v_total_active_days := COALESCE(array_length(v_sorted_days, 1), 0);

    IF v_total_active_days = 0 THEN
      v_streak := 0;
    ELSE
      v_check_date := v_today;
      IF NOT (v_today::text = ANY(v_sorted_days)) THEN
        v_check_date := v_today - 1;
      END IF;

      v_consecutive_gaps := 0;
      v_entries_studied := 0;
      v_entries_gaps := 0;
      v_entries_total := 0;

      FOR i IN 0..729 LOOP
        v_day_key := (v_check_date - i)::text;
        v_studied := v_day_key = ANY(v_sorted_days);
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

      IF v_entries_total > 0 THEN
        v_day_key := (v_check_date - (v_entries_total - 1))::text;
        IF NOT (v_day_key = ANY(v_sorted_days)) THEN
          v_entries_gaps := v_entries_gaps - 1;
          v_entries_total := v_entries_total - 1;
        END IF;
      END IF;

      v_total_freezes := v_entries_studied / 7;

      IF v_total_freezes >= v_entries_gaps THEN
        v_streak := v_entries_total;
      ELSE
        v_streak := v_entries_studied + LEAST(v_total_freezes, v_entries_gaps);
      END IF;
    END IF;

    user_id := rec.uid;
    user_name := rec.uname;
    cards_30d := rec.c30;
    minutes_30d := rec.m30;
    current_streak := v_streak;
    RETURN NEXT;
  END LOOP;
END;
$$;