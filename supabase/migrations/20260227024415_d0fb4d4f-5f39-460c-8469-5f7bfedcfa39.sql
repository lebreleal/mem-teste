ALTER TABLE decks 
  ADD COLUMN IF NOT EXISTS bury_new_siblings boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bury_review_siblings boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bury_learning_siblings boolean NOT NULL DEFAULT true;

-- Copy current bury_siblings value to the 3 new columns
UPDATE decks SET 
  bury_new_siblings = bury_siblings,
  bury_review_siblings = bury_siblings,
  bury_learning_siblings = bury_siblings;