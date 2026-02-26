
UPDATE public.decks SET algorithm_mode = 'fsrs' WHERE algorithm_mode = 'sm2';
UPDATE public.decks SET requested_retention = 0.85 WHERE requested_retention = 0.9;
UPDATE public.decks SET daily_review_limit = 9999;
