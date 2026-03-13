
-- Return all cards from the error deck back to their original decks
UPDATE cards 
SET deck_id = origin_deck_id, 
    origin_deck_id = NULL 
WHERE origin_deck_id IS NOT NULL 
  AND deck_id IN (
    SELECT id FROM decks WHERE name = '📕 Caderno de Erros'
  );
