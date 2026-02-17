
-- Add daily limits to decks table
ALTER TABLE public.decks
ADD COLUMN daily_new_limit integer NOT NULL DEFAULT 20,
ADD COLUMN daily_review_limit integer NOT NULL DEFAULT 100;
