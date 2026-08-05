DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, integer, numeric, boolean);
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, integer, numeric, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, integer, numeric, boolean, timestamptz, numeric);

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_energy integer DEFAULT NULL,
  p_memocoins numeric DEFAULT NULL,
  p_is_banned boolean DEFAULT NULL,
  p_premium_expires_at timestamptz DEFAULT NULL,
  p_ai_credits numeric DEFAULT NULL,
  p_ai_credits_purchased numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_daily numeric;
  v_old_purchased numeric;
  v_delta numeric;
  v_new_total numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT ai_credits, ai_credits_purchased
    INTO v_old_daily, v_old_purchased
  FROM profiles WHERE id = p_user_id;

  UPDATE profiles SET
    name = COALESCE(p_name, name),
    energy = COALESCE(p_energy, energy),
    ai_credits = COALESCE(p_ai_credits, ai_credits),
    ai_credits_purchased = COALESCE(p_ai_credits_purchased, ai_credits_purchased),
    memocoins = COALESCE(p_memocoins, memocoins),
    is_banned = COALESCE(p_is_banned, is_banned),
    premium_expires_at = COALESCE(p_premium_expires_at, premium_expires_at),
    updated_at = now()
  WHERE id = p_user_id;

  v_delta := COALESCE(p_ai_credits, v_old_daily, 0) - COALESCE(v_old_daily, 0)
           + COALESCE(p_ai_credits_purchased, v_old_purchased, 0) - COALESCE(v_old_purchased, 0);
  v_new_total := COALESCE(p_ai_credits, v_old_daily, 0) + COALESCE(p_ai_credits_purchased, v_old_purchased, 0);

  IF v_delta <> 0 THEN
    INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, feature_key, cost_usd, description)
    VALUES (p_user_id, 'grant', v_delta, v_new_total, 'admin_adjust', 0, 'Ajuste manual de créditos pelo admin');
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_get_profiles(text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_get_profiles(p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, name text, email text, energy integer,
  ai_credits numeric, ai_credits_purchased numeric, memocoins numeric,
  creator_tier integer, is_banned boolean, created_at timestamptz,
  daily_cards_studied integer, successful_cards_counter integer,
  onboarding_completed boolean, premium_expires_at timestamptz
)
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
    p.id, p.name, p.email, p.energy, p.ai_credits, p.ai_credits_purchased, p.memocoins,
    p.creator_tier, p.is_banned, p.created_at,
    p.daily_cards_studied, p.successful_cards_counter,
    p.onboarding_completed, p.premium_expires_at
  FROM profiles p
  WHERE (p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.email ILIKE '%' || p_search || '%')
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;