
-- 1. Create atomic deduct_energy RPC to fix race condition
CREATE OR REPLACE FUNCTION public.deduct_energy(p_user_id uuid, p_cost integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer;
BEGIN
  IF p_cost <= 0 THEN
    SELECT energy INTO v_remaining FROM profiles WHERE id = p_user_id;
    RETURN COALESCE(v_remaining, 0);
  END IF;

  UPDATE profiles
  SET energy = energy - p_cost
  WHERE id = p_user_id AND energy >= p_cost
  RETURNING energy INTO v_remaining;

  IF v_remaining IS NULL THEN
    RETURN -1; -- indicates insufficient energy
  END IF;

  RETURN v_remaining;
END;
$$;

-- 2. Fix turmas invite code policy - drop the overly permissive one
DROP POLICY IF EXISTS "Anyone authenticated can find turma by invite code" ON public.turmas;

-- Create a restrictive policy that only allows finding by exact invite_code match
CREATE POLICY "Find turma by invite code"
ON public.turmas
FOR SELECT
TO authenticated
USING (
  -- Only allow access when filtering by exact invite_code
  -- This prevents enumeration of all turmas
  invite_code = current_setting('request.headers', true)::json->>'x-invite-code'
  OR is_turma_member(auth.uid(), id)
  OR owner_id = auth.uid()
  OR (is_private = false)
);

-- Actually, the above approach with headers is too complex. Let's use a simpler RPC approach instead.
DROP POLICY IF EXISTS "Find turma by invite code" ON public.turmas;

-- Drop the redundant policies and consolidate
DROP POLICY IF EXISTS "Anyone can view public turmas" ON public.turmas;
DROP POLICY IF EXISTS "Members can view their turmas" ON public.turmas;

-- Single consolidated SELECT policy
CREATE POLICY "Users can view turmas they have access to"
ON public.turmas
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR is_turma_member(auth.uid(), id)
  OR is_private = false
);

-- Create a secure RPC for finding turma by invite code
CREATE OR REPLACE FUNCTION public.find_turma_by_invite_code(p_invite_code text)
RETURNS TABLE(id uuid, name text, description text, is_private boolean, cover_image_url text, owner_id uuid, subscription_price numeric, avg_rating numeric, rating_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.description, t.is_private, t.cover_image_url, t.owner_id, t.subscription_price, t.avg_rating, t.rating_count
  FROM turmas t
  WHERE t.invite_code = p_invite_code
  LIMIT 1;
END;
$$;
