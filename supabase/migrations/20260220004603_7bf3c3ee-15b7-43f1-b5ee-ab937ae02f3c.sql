-- Drop the old single-param overloads that conflict with the new tz-aware versions
DROP FUNCTION IF EXISTS public.get_all_user_deck_stats(uuid);
DROP FUNCTION IF EXISTS public.get_deck_stats(uuid);
DROP FUNCTION IF EXISTS public.get_study_queue_limits(uuid, uuid[]);