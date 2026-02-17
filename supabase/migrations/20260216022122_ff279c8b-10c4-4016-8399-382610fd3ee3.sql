
CREATE OR REPLACE FUNCTION public.process_turma_subscription(p_turma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_turma RECORD;
  v_user_energy INTEGER;
  v_owner_energy INTEGER;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get turma info
  SELECT * INTO v_turma FROM turmas WHERE id = p_turma_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  -- Check membership
  IF NOT is_turma_member(v_user_id, p_turma_id) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  -- Check if already subscriber
  IF EXISTS (SELECT 1 FROM turma_members WHERE turma_id = p_turma_id AND user_id = v_user_id AND is_subscriber = true) THEN
    -- Check if subscription is still active
    IF EXISTS (
      SELECT 1 FROM turma_subscriptions 
      WHERE turma_id = p_turma_id AND user_id = v_user_id AND expires_at > now()
    ) THEN
      RAISE EXCEPTION 'Already subscribed';
    END IF;
  END IF;

  -- Handle payment if price > 0
  IF v_turma.subscription_price > 0 THEN
    -- Lock and check buyer balance
    SELECT energy INTO v_user_energy FROM profiles WHERE id = v_user_id FOR UPDATE;
    IF v_user_energy < v_turma.subscription_price THEN
      RAISE EXCEPTION 'Insufficient credits';
    END IF;

    -- Deduct from subscriber
    UPDATE profiles SET energy = energy - v_turma.subscription_price WHERE id = v_user_id;

    -- Credit to owner
    UPDATE profiles SET energy = energy + v_turma.subscription_price WHERE id = v_turma.owner_id;

    -- Record transactions
    INSERT INTO memocoin_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_user_id, -v_turma.subscription_price, 'debit', 'Assinatura: ' || v_turma.name, p_turma_id);

    INSERT INTO memocoin_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_turma.owner_id, v_turma.subscription_price, 'credit', 'Assinatura recebida: ' || v_turma.name, p_turma_id);
  END IF;

  -- Mark as subscriber
  UPDATE turma_members SET is_subscriber = true
  WHERE turma_id = p_turma_id AND user_id = v_user_id;

  -- Create subscription record (7 days)
  v_expires_at := now() + interval '7 days';
  INSERT INTO turma_subscriptions (turma_id, user_id, amount, started_at, expires_at)
  VALUES (p_turma_id, v_user_id, v_turma.subscription_price, now(), v_expires_at);

  RETURN jsonb_build_object('success', true, 'expires_at', v_expires_at);
END;
$function$;
