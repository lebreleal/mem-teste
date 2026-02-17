
-- 1. Add admin role for leallebre@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('23ee3827-baf3-4281-ad2d-3e0547bf05ef', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Add is_banned to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- 3. Create ai_token_usage table for tracking real token consumption
CREATE TABLE public.ai_token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_key text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;

-- Users can view own usage
CREATE POLICY "Users can view own token usage"
ON public.ai_token_usage FOR SELECT
USING (auth.uid() = user_id);

-- Edge functions insert via service role, but also allow authenticated insert for own records
CREATE POLICY "Users can insert own token usage"
ON public.ai_token_usage FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all token usage
CREATE POLICY "Admins can view all token usage"
ON public.ai_token_usage FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Create index for fast lookups
CREATE INDEX idx_ai_token_usage_user_id ON public.ai_token_usage (user_id);
CREATE INDEX idx_ai_token_usage_feature ON public.ai_token_usage (feature_key);
CREATE INDEX idx_ai_token_usage_created ON public.ai_token_usage (created_at);

-- 4. Create ai_settings table for global AI config (model mapping etc)
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
CREATE POLICY "Authenticated can read ai_settings"
ON public.ai_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can manage settings
CREATE POLICY "Admins can manage ai_settings"
ON public.ai_settings FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Seed default model mapping
INSERT INTO public.ai_settings (key, value) VALUES
  ('flash_model', 'gpt-4o-mini'),
  ('pro_model', 'gpt-4o');

-- 5. Create admin function to get all profiles (bypasses RLS)
CREATE OR REPLACE FUNCTION public.admin_get_profiles(p_search text DEFAULT '', p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  energy integer,
  memocoins numeric,
  creator_tier integer,
  is_banned boolean,
  created_at timestamptz,
  daily_cards_studied integer,
  successful_cards_counter integer,
  onboarding_completed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT p.id, p.name, p.email, p.energy, p.memocoins, p.creator_tier,
         p.is_banned, p.created_at, p.daily_cards_studied, p.successful_cards_counter,
         p.onboarding_completed
  FROM profiles p
  WHERE (p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%')
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 6. Admin function to get user decks
CREATE OR REPLACE FUNCTION public.admin_get_user_decks(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  created_at timestamptz,
  is_archived boolean,
  card_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT d.id, d.name, d.created_at, d.is_archived,
         (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count
  FROM decks d
  WHERE d.user_id = p_user_id
  ORDER BY d.created_at DESC;
END;
$$;

-- 7. Admin function to get user token usage summary
CREATE OR REPLACE FUNCTION public.admin_get_user_token_usage(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  feature_key text,
  model text,
  total_calls bigint,
  total_prompt_tokens bigint,
  total_completion_tokens bigint,
  total_tokens_sum bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT t.feature_key, t.model,
         COUNT(*) as total_calls,
         SUM(t.prompt_tokens)::bigint as total_prompt_tokens,
         SUM(t.completion_tokens)::bigint as total_completion_tokens,
         SUM(t.total_tokens)::bigint as total_tokens_sum
  FROM ai_token_usage t
  WHERE t.user_id = p_user_id
    AND t.created_at >= now() - (p_days || ' days')::interval
  GROUP BY t.feature_key, t.model
  ORDER BY total_tokens_sum DESC;
END;
$$;

-- 8. Admin function to get user study history (review_logs by date)
CREATE OR REPLACE FUNCTION public.admin_get_user_study_history(p_user_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE(
  study_date date,
  cards_reviewed bigint,
  avg_rating numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT (r.reviewed_at AT TIME ZONE 'UTC')::date AS study_date,
         COUNT(*) AS cards_reviewed,
         ROUND(AVG(r.rating), 2) AS avg_rating
  FROM review_logs r
  WHERE r.user_id = p_user_id
    AND r.reviewed_at >= now() - (p_days || ' days')::interval
  GROUP BY study_date
  ORDER BY study_date DESC;
END;
$$;

-- 9. Admin update profile function
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_energy integer DEFAULT NULL,
  p_memocoins numeric DEFAULT NULL,
  p_is_banned boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  UPDATE profiles SET
    name = COALESCE(p_name, name),
    energy = COALESCE(p_energy, energy),
    memocoins = COALESCE(p_memocoins, memocoins),
    is_banned = COALESCE(p_is_banned, is_banned),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;
