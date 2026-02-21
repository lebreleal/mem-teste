
-- Table for study plans
CREATE TABLE public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_minutes integer NOT NULL DEFAULT 60,
  deck_ids uuid[] NOT NULL DEFAULT '{}',
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan" ON public.study_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plan" ON public.study_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plan" ON public.study_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plan" ON public.study_plans FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_study_plans_updated_at
  BEFORE UPDATE ON public.study_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: get_avg_seconds_per_card
CREATE OR REPLACE FUNCTION public.get_avg_seconds_per_card(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_avg numeric;
  v_global_avg numeric;
BEGIN
  -- User's own average: group consecutive review_logs into sessions (gap < 5min)
  WITH ordered_logs AS (
    SELECT reviewed_at,
           LAG(reviewed_at) OVER (ORDER BY reviewed_at) AS prev_at
    FROM review_logs
    WHERE user_id = p_user_id
      AND reviewed_at > now() - interval '30 days'
  ),
  session_gaps AS (
    SELECT reviewed_at, prev_at,
           CASE WHEN prev_at IS NULL OR EXTRACT(EPOCH FROM (reviewed_at - prev_at)) > 300 THEN 1 ELSE 0 END AS new_session
    FROM ordered_logs
  ),
  sessions AS (
    SELECT reviewed_at, prev_at,
           SUM(new_session) OVER (ORDER BY reviewed_at) AS session_id
    FROM session_gaps
  ),
  session_stats AS (
    SELECT session_id,
           COUNT(*) AS card_count,
           EXTRACT(EPOCH FROM (MAX(reviewed_at) - MIN(reviewed_at))) AS duration_sec
    FROM sessions
    GROUP BY session_id
    HAVING COUNT(*) >= 2
  )
  SELECT AVG(duration_sec / card_count) INTO v_user_avg
  FROM session_stats
  WHERE duration_sec > 0;

  IF v_user_avg IS NOT NULL AND v_user_avg > 0 THEN
    RETURN LEAST(v_user_avg, 120); -- cap at 2 min
  END IF;

  -- Global fallback: top 10 most active users this week
  WITH top_users AS (
    SELECT user_id, COUNT(*) AS cnt
    FROM review_logs
    WHERE reviewed_at > now() - interval '7 days'
    GROUP BY user_id
    ORDER BY cnt DESC
    LIMIT 10
  ),
  their_logs AS (
    SELECT rl.user_id, rl.reviewed_at,
           LAG(rl.reviewed_at) OVER (PARTITION BY rl.user_id ORDER BY rl.reviewed_at) AS prev_at
    FROM review_logs rl
    JOIN top_users tu ON tu.user_id = rl.user_id
    WHERE rl.reviewed_at > now() - interval '7 days'
  ),
  gaps AS (
    SELECT reviewed_at, prev_at, user_id,
           CASE WHEN prev_at IS NULL OR EXTRACT(EPOCH FROM (reviewed_at - prev_at)) > 300 THEN 1 ELSE 0 END AS new_session
    FROM their_logs
  ),
  global_sessions AS (
    SELECT user_id, reviewed_at, prev_at,
           SUM(new_session) OVER (PARTITION BY user_id ORDER BY reviewed_at) AS session_id
    FROM gaps
  ),
  global_stats AS (
    SELECT session_id, user_id,
           COUNT(*) AS card_count,
           EXTRACT(EPOCH FROM (MAX(reviewed_at) - MIN(reviewed_at))) AS duration_sec
    FROM global_sessions
    GROUP BY session_id, user_id
    HAVING COUNT(*) >= 2
  )
  SELECT AVG(duration_sec / card_count) INTO v_global_avg
  FROM global_stats
  WHERE duration_sec > 0;

  IF v_global_avg IS NOT NULL AND v_global_avg > 0 THEN
    RETURN LEAST(v_global_avg, 120);
  END IF;

  RETURN 30; -- default fallback
END;
$$;

-- RPC: get_plan_metrics
CREATE OR REPLACE FUNCTION public.get_plan_metrics(p_user_id uuid, p_deck_ids uuid[])
RETURNS TABLE(total_new bigint, total_review bigint, total_learning bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COUNT(*) FILTER (WHERE c.state = 0) AS total_new,
    COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS total_review,
    COUNT(*) FILTER (WHERE c.state = 1) AS total_learning
  FROM cards c
  JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
    AND c.deck_id = ANY(p_deck_ids);
$$;
