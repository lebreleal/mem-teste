
ALTER TABLE public.cards ADD COLUMN origin_deck_id uuid DEFAULT NULL;

COMMENT ON COLUMN public.cards.origin_deck_id IS 'Original deck ID when card is temporarily in the error notebook deck. NULL means card is in its home deck.';
