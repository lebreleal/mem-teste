-- Fix the DPOC deck that was imported without proper source references
UPDATE decks 
SET community_id = '0a891b00-eea6-4143-9200-99f826e6cd32'
WHERE id = 'aae3f80e-cfe9-41b2-b0f7-b845003b737f' 
AND is_live_deck = true 
AND community_id IS NULL;