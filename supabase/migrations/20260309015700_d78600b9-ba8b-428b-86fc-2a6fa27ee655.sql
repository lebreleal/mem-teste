-- Activate all existing user profiles as public for ranking
UPDATE public.profiles SET is_profile_public = true WHERE is_profile_public = false;

-- Set default to true for new users
ALTER TABLE public.profiles ALTER COLUMN is_profile_public SET DEFAULT true;