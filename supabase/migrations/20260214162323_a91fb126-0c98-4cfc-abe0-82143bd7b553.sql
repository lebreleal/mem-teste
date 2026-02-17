
-- Drop the view approach - use a function instead
DROP VIEW IF EXISTS public.public_profiles;

-- Create a security definer function to get public profile info
CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids UUID[])
RETURNS TABLE(id UUID, name TEXT, creator_tier INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.creator_tier
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles TO authenticated;
