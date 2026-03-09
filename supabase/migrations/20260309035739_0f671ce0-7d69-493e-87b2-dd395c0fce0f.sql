
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_energy integer DEFAULT NULL,
  p_memocoins numeric DEFAULT NULL,
  p_is_banned boolean DEFAULT NULL,
  p_premium_expires_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    premium_expires_at = CASE WHEN p_premium_expires_at IS NOT NULL THEN p_premium_expires_at ELSE premium_expires_at END,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;
