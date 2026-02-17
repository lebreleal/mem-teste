
CREATE OR REPLACE FUNCTION public.restore_subscription_status(p_turma_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_has_active boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN false; END IF;

  -- Check if user has an active (non-expired) subscription
  SELECT EXISTS (
    SELECT 1 FROM turma_subscriptions
    WHERE turma_id = p_turma_id AND user_id = v_user_id AND expires_at > now()
  ) INTO v_has_active;

  IF v_has_active THEN
    UPDATE turma_members SET is_subscriber = true
    WHERE turma_id = p_turma_id AND user_id = v_user_id AND is_subscriber = false;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
