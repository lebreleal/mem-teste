DROP FUNCTION IF EXISTS public.admin_get_profiles(text, integer, integer);

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
  onboarding_completed boolean,
  premium_expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.email, p.energy, p.memocoins,
    p.creator_tier, p.is_banned, p.created_at,
    p.daily_cards_studied, p.successful_cards_counter,
    p.onboarding_completed, p.premium_expires_at
  FROM profiles p
  WHERE (p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%')
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;