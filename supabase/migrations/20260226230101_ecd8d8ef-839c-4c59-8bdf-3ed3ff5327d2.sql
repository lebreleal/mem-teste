
ALTER TABLE public.decks ALTER COLUMN algorithm_mode SET DEFAULT 'fsrs';
ALTER TABLE public.decks ALTER COLUMN requested_retention SET DEFAULT 0.85;
ALTER TABLE public.decks ALTER COLUMN daily_review_limit SET DEFAULT 9999;
