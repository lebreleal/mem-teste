
-- Change default algorithm_mode from 'fsrs' to 'sm2'
ALTER TABLE public.decks ALTER COLUMN algorithm_mode SET DEFAULT 'sm2';

-- Add requested_retention column for FSRS premium
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS requested_retention double precision NOT NULL DEFAULT 0.9;
