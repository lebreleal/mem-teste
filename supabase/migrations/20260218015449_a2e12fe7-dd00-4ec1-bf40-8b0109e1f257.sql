ALTER TABLE exams ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();
ALTER TABLE decks ADD COLUMN IF NOT EXISTS synced_at timestamptz DEFAULT now();