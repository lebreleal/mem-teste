
-- Allow authenticated users to read basic profile info (name, creator_tier) for marketplace/turma features
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);
