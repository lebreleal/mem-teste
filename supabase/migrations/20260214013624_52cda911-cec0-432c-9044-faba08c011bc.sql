
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_energy_recharge date,
ADD COLUMN IF NOT EXISTS daily_cards_studied integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_energy_earned integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_study_reset_date date;
