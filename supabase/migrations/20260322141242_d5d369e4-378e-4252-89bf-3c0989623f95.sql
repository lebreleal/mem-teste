
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS last_rating smallint DEFAULT NULL;

COMMENT ON COLUMN public.cards.last_rating IS 'Last review rating (1=Errei, 2=Difícil, 3=Bom, 4=Fácil). Updated on each review.';
