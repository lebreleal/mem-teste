UPDATE decks 
SET folder_id = '8902dd57-6b6c-4d52-9151-522443a83cab', updated_at = now()
WHERE user_id = '06cfa099-1bd1-4de3-aa6d-f97d71535300' 
  AND folder_id IS NULL 
  AND parent_deck_id IS NULL 
  AND is_archived = false;