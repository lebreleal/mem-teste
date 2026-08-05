ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_credits_purchased numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.grant_daily_ai_credits()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_daily numeric;
  v_daily_balance numeric;
  v_purchased numeric;
  v_last date;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE((SELECT value::numeric FROM public.ai_settings WHERE key = 'daily_free_credits'), 50)
    INTO v_daily;

  SELECT ai_credits, ai_credits_purchased, last_daily_credits_grant
    INTO v_daily_balance, v_purchased, v_last
    FROM public.profiles WHERE id = v_user;

  IF v_last IS NOT NULL AND v_last = CURRENT_DATE THEN
    RETURN COALESCE(v_daily_balance, 0) + COALESCE(v_purchased, 0);
  END IF;

  UPDATE public.profiles
     SET ai_credits = v_daily,
         last_daily_credits_grant = CURRENT_DATE
   WHERE id = v_user
  RETURNING ai_credits, ai_credits_purchased INTO v_daily_balance, v_purchased;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, description)
  VALUES (v_user, 'daily', v_daily, COALESCE(v_daily_balance,0) + COALESCE(v_purchased,0), 'Bônus diário gratuito');

  RETURN COALESCE(v_daily_balance, 0) + COALESCE(v_purchased, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_ai_credits(p_user_id uuid, p_credits numeric, p_feature_key text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily numeric;
  v_purchased numeric;
  v_from_daily numeric;
  v_from_purchased numeric;
BEGIN
  SELECT ai_credits, ai_credits_purchased INTO v_daily, v_purchased
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_daily IS NULL THEN RETURN -1; END IF;

  IF p_credits <= 0 THEN
    RETURN COALESCE(v_daily,0) + COALESCE(v_purchased,0);
  END IF;

  IF COALESCE(v_daily,0) + COALESCE(v_purchased,0) < p_credits THEN
    RETURN -1;
  END IF;

  v_from_daily := LEAST(COALESCE(v_daily,0), p_credits);
  v_from_purchased := p_credits - v_from_daily;

  UPDATE public.profiles
     SET ai_credits = ai_credits - v_from_daily,
         ai_credits_purchased = ai_credits_purchased - v_from_purchased
   WHERE id = p_user_id
  RETURNING ai_credits, ai_credits_purchased INTO v_daily, v_purchased;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, feature_key, description)
  VALUES (p_user_id, 'consumption', -p_credits, COALESCE(v_daily,0) + COALESCE(v_purchased,0), p_feature_key, 'Reserva de créditos');

  RETURN COALESCE(v_daily,0) + COALESCE(v_purchased,0);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_credits(p_user_id uuid, p_held numeric, p_actual numeric, p_feature_key text, p_model text DEFAULT NULL::text, p_cost_usd numeric DEFAULT 0)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta numeric := COALESCE(p_held, 0) - COALESCE(p_actual, 0);
  v_daily numeric;
  v_purchased numeric;
  v_from_daily numeric;
  v_from_purchased numeric;
BEGIN
  SELECT ai_credits, ai_credits_purchased INTO v_daily, v_purchased
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_delta >= 0 THEN
    UPDATE public.profiles SET ai_credits = ai_credits + v_delta WHERE id = p_user_id
    RETURNING ai_credits, ai_credits_purchased INTO v_daily, v_purchased;
  ELSE
    v_from_daily := LEAST(COALESCE(v_daily,0), -v_delta);
    v_from_purchased := GREATEST(-v_delta - v_from_daily, 0);
    UPDATE public.profiles
       SET ai_credits = GREATEST(ai_credits - v_from_daily, 0),
           ai_credits_purchased = GREATEST(ai_credits_purchased - v_from_purchased, 0)
     WHERE id = p_user_id
    RETURNING ai_credits, ai_credits_purchased INTO v_daily, v_purchased;
  END IF;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, feature_key, model, cost_usd, description)
  VALUES (
    p_user_id,
    CASE WHEN v_delta > 0 THEN 'refund' ELSE 'consumption' END,
    v_delta,
    COALESCE(v_daily,0) + COALESCE(v_purchased,0),
    p_feature_key, p_model, COALESCE(p_cost_usd, 0), 'Acerto pelo custo real'
  );

  RETURN COALESCE(v_daily,0) + COALESCE(v_purchased,0);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_ai_credits(p_user_id uuid, p_credits numeric, p_entry_type text, p_description text DEFAULT ''::text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily numeric;
  v_purchased numeric;
BEGIN
  IF p_credits <= 0 THEN
    SELECT ai_credits, ai_credits_purchased INTO v_daily, v_purchased FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_daily,0) + COALESCE(v_purchased,0);
  END IF;

  UPDATE public.profiles
     SET ai_credits_purchased = ai_credits_purchased + p_credits
   WHERE id = p_user_id
  RETURNING ai_credits, ai_credits_purchased INTO v_daily, v_purchased;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, description)
  VALUES (p_user_id, p_entry_type, p_credits, COALESCE(v_daily,0) + COALESCE(v_purchased,0), COALESCE(p_description, ''));

  RETURN COALESCE(v_daily,0) + COALESCE(v_purchased,0);
END;
$$;