
-- Add learning_step to cards (tracks which learning step the card is on)
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS learning_step integer NOT NULL DEFAULT 0;

-- Add bury_siblings to decks (auto-bury cloze siblings)
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS bury_siblings boolean NOT NULL DEFAULT true;
