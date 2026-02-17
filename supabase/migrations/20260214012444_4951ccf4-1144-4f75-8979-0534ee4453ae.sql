
-- Add energy column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS energy integer NOT NULL DEFAULT 10;

-- Add successful_cards_counter to track progress toward next energy reward
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS successful_cards_counter integer NOT NULL DEFAULT 0;
