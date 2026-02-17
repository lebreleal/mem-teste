
-- Add premium_expires_at column to profiles
ALTER TABLE public.profiles
ADD COLUMN premium_expires_at timestamp with time zone DEFAULT NULL;

-- Set existing users who don't have it yet: give 14 days from creation
UPDATE public.profiles
SET premium_expires_at = created_at + interval '14 days'
WHERE premium_expires_at IS NULL;

-- Update handle_new_user to auto-set 14 days trial
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, email, premium_expires_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email, now() + interval '14 days');
  RETURN NEW;
END;
$function$;
