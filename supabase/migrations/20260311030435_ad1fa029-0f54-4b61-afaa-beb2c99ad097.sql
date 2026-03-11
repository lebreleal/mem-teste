-- Fix orphan live decks missing community_id
UPDATE decks SET community_id = '0a891b00-eea6-4143-9200-99f826e6cd32' 
WHERE id = '88be8bdf-4a66-4857-b3f5-5fcf97b11829' AND is_live_deck = true AND community_id IS NULL;