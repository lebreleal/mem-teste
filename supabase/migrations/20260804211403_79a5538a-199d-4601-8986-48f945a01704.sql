ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_credits numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_daily_credits_grant date;

UPDATE public.profiles SET ai_credits = COALESCE(energy, 0) WHERE ai_credits = 0;

CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  feature_key text,
  model text,
  cost_usd numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_credit_ledger TO authenticated;
GRANT ALL ON public.ai_credit_ledger TO service_role;

ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own credit ledger" ON public.ai_credit_ledger;
CREATE POLICY "Users read own credit ledger"
  ON public.ai_credit_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_credit_ledger_user_created_idx
  ON public.ai_credit_ledger (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ai_settings_key_uidx ON public.ai_settings (key);

INSERT INTO public.ai_settings (key, value) VALUES
  ('credit_usd_rate', '0.001'),
  ('credit_markup', '4'),
  ('daily_free_credits', '50'),
  ('signup_bonus_credits', '300')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hold_ai_credits(
  p_user_id uuid,
  p_credits numeric,
  p_feature_key text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_credits <= 0 THEN
    SELECT ai_credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.profiles
     SET ai_credits = ai_credits - p_credits
   WHERE id = p_user_id AND ai_credits >= p_credits
  RETURNING ai_credits INTO v_balance;

  IF v_balance IS NULL THEN
    RETURN -1;
  END IF;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, feature_key, description)
  VALUES (p_user_id, 'consumption', -p_credits, v_balance, p_feature_key, 'Reserva de créditos');

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_credits(
  p_user_id uuid,
  p_held numeric,
  p_actual numeric,
  p_feature_key text,
  p_model text DEFAULT NULL,
  p_cost_usd numeric DEFAULT 0
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta numeric := COALESCE(p_held, 0) - COALESCE(p_actual, 0);
  v_balance numeric;
BEGIN
  UPDATE public.profiles
     SET ai_credits = GREATEST(ai_credits + v_delta, 0)
   WHERE id = p_user_id
  RETURNING ai_credits INTO v_balance;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, feature_key, model, cost_usd, description)
  VALUES (
    p_user_id,
    CASE WHEN v_delta > 0 THEN 'refund' ELSE 'consumption' END,
    v_delta,
    COALESCE(v_balance, 0),
    p_feature_key,
    p_model,
    COALESCE(p_cost_usd, 0),
    'Acerto pelo custo real'
  );

  RETURN COALESCE(v_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_ai_credits(
  p_user_id uuid,
  p_credits numeric,
  p_entry_type text,
  p_description text DEFAULT ''
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  IF p_credits <= 0 THEN
    SELECT ai_credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.profiles
     SET ai_credits = ai_credits + p_credits
   WHERE id = p_user_id
  RETURNING ai_credits INTO v_balance;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, description)
  VALUES (p_user_id, p_entry_type, p_credits, COALESCE(v_balance, 0), COALESCE(p_description, ''));

  RETURN COALESCE(v_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_daily_ai_credits()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_daily numeric;
  v_balance numeric;
  v_last date;
  v_topup numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE((SELECT value::numeric FROM public.ai_settings WHERE key = 'daily_free_credits'), 50)
    INTO v_daily;

  SELECT ai_credits, last_daily_credits_grant INTO v_balance, v_last
    FROM public.profiles WHERE id = v_user;

  IF v_last IS NOT NULL AND v_last = CURRENT_DATE THEN
    RETURN COALESCE(v_balance, 0);
  END IF;

  v_topup := GREATEST(v_daily - COALESCE(v_balance, 0), 0);

  UPDATE public.profiles
     SET ai_credits = ai_credits + v_topup,
         last_daily_credits_grant = CURRENT_DATE
   WHERE id = v_user
  RETURNING ai_credits INTO v_balance;

  IF v_topup > 0 THEN
    INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, description)
    VALUES (v_user, 'daily', v_topup, v_balance, 'Bônus diário gratuito');
  END IF;

  RETURN COALESCE(v_balance, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_daily_ai_credits() TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_signup_ai_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus numeric;
BEGIN
  SELECT COALESCE((SELECT value::numeric FROM public.ai_settings WHERE key = 'signup_bonus_credits'), 300)
    INTO v_bonus;

  UPDATE public.profiles SET ai_credits = ai_credits + v_bonus WHERE id = NEW.id;

  INSERT INTO public.ai_credit_ledger (user_id, entry_type, amount, balance_after, description)
  VALUES (NEW.id, 'signup', v_bonus, v_bonus, 'Bônus de boas-vindas');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_signup_ai_credits ON public.profiles;
CREATE TRIGGER profiles_signup_ai_credits
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_signup_ai_credits();