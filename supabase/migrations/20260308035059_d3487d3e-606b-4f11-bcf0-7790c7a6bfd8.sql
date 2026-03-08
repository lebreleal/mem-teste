CREATE OR REPLACE FUNCTION public.refund_energy(p_user_id uuid, p_cost integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_cost <= 0 THEN RETURN; END IF;
  UPDATE profiles SET energy = energy + p_cost WHERE id = p_user_id;
END;
$$;