
-- Add algorithm configuration columns to decks
ALTER TABLE public.decks
ADD COLUMN algorithm_mode text NOT NULL DEFAULT 'fsrs',
ADD COLUMN shuffle_cards boolean NOT NULL DEFAULT true,
ADD COLUMN learning_steps text[] NOT NULL DEFAULT ARRAY['1m', '15m'],
ADD COLUMN easy_bonus integer NOT NULL DEFAULT 130,
ADD COLUMN interval_modifier integer NOT NULL DEFAULT 100,
ADD COLUMN max_interval integer NOT NULL DEFAULT 1000;
