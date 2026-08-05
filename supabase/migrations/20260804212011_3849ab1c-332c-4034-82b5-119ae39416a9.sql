DROP FUNCTION IF EXISTS public.admin_get_profiles(text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_get_profiles(p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, email text, energy integer, ai_credits numeric, memocoins numeric, creator_tier integer, is_banned boolean, created_at timestamp with time zone, daily_cards_studied integer, successful_cards_counter integer, onboarding_completed boolean, premium_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.email, p.energy, p.ai_credits, p.memocoins,
    p.creator_tier, p.is_banned, p.created_at,
    p.daily_cards_studied, p.successful_cards_counter,
    p.onboarding_completed, p.premium_expires_at
  FROM profiles p
  WHERE (p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%')
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_name text DEFAULT NULL::text,
  p_energy integer DEFAULT NULL::integer,
  p_memocoins numeric DEFAULT NULL::numeric,
  p_is_banned boolean DEFAULT NULL::boolean,
  p_premium_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_ai_credits numeric DEFAULT NULL::numeric
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT ai_credits INTO v_old FROM profiles WHERE id = p_user_id;

  UPDATE profiles SET
    name = COALESCE(p_name, name),
    energy = COALESCE(p_energy, energy),
    ai_credits = COALESCE(p_ai_credits, ai_credits),
    memocoins = COALESCE(p_memocoins, memocoins),
    is_banned = COALESCE(p_is_banned, is_banned),
    premium_expires_at = CASE WHEN p_premium_expires_at IS NOT NULL THEN p_premium_expires_at ELSE premium_expires_at END,
    updated_at = now()
  WHERE id = p_user_id;

  IF p_ai_credits IS NOT NULL AND p_ai_credits <> COALESCE(v_old, 0) THEN
    INSERT INTO public.ai_credit_ledger (user_id, amount, kind, feature_key, balance_after, metadata)
    VALUES (p_user_id, p_ai_credits - COALESCE(v_old, 0), 'grant', 'admin_adjust', p_ai_credits,
            jsonb_build_object('admin_id', auth.uid()));
  END IF;
END;
$function$;