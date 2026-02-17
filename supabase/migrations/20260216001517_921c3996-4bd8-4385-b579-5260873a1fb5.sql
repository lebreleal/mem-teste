-- Drop the overly permissive policy that exposes all profile fields to any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;