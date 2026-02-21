ALTER TABLE public.profiles
ADD COLUMN daily_new_cards_limit integer NOT NULL DEFAULT 30;