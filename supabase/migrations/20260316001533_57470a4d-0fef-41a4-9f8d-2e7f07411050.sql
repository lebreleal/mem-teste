-- Revert: move the 5 incorrectly assigned decks back to folder_id = NULL
UPDATE decks 
SET folder_id = NULL, updated_at = now()
WHERE id IN (
  'dcb36c64-3a65-4ea2-92c4-7a2f4fc67e2a',
  '8b565fe0-6187-47ca-8356-85e3d906db56',
  'e86ffb2e-026b-4d5f-a210-bc2035379961',
  '808ce6c0-0936-4b53-847a-71355d49e5fb',
  '8d3d813f-5f77-45a1-acf5-af464224ecd4'
);