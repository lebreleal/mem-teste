
-- Delete review_logs and then cards from parent decks (matérias with children)
DELETE FROM review_logs
WHERE card_id IN (
  SELECT c.id FROM cards c
  WHERE c.deck_id IN (
    SELECT DISTINCT parent.id
    FROM decks parent
    INNER JOIN decks child ON child.parent_deck_id = parent.id
  )
);

-- Also delete concept_cards references
DELETE FROM concept_cards
WHERE card_id IN (
  SELECT c.id FROM cards c
  WHERE c.deck_id IN (
    SELECT DISTINCT parent.id
    FROM decks parent
    INNER JOIN decks child ON child.parent_deck_id = parent.id
  )
);

-- Also delete card_tags references
DELETE FROM card_tags
WHERE card_id IN (
  SELECT c.id FROM cards c
  WHERE c.deck_id IN (
    SELECT DISTINCT parent.id
    FROM decks parent
    INNER JOIN decks child ON child.parent_deck_id = parent.id
  )
);

-- Now delete the cards
DELETE FROM cards
WHERE deck_id IN (
  SELECT DISTINCT parent.id
  FROM decks parent
  INNER JOIN decks child ON child.parent_deck_id = parent.id
);
