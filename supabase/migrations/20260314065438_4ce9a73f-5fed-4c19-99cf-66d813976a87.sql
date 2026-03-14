
-- For users who have decks without a folder_id, ensure they have a default "Classe" folder
-- and move orphaned root decks into it.

-- Step 1: Create the default "Classe de <name>" folder for users who have orphaned decks
-- but don't have any folder yet
INSERT INTO folders (user_id, name, section, sort_order)
SELECT DISTINCT d.user_id, 'Classe de ' || COALESCE(NULLIF(TRIM(p.name), ''), 'Estudante'), 'personal', 0
FROM decks d
JOIN profiles p ON p.id = d.user_id
WHERE d.folder_id IS NULL
  AND d.is_archived = false
  AND NOT EXISTS (
    SELECT 1 FROM folders f WHERE f.user_id = d.user_id
  );

-- Step 2: For users who already have folders but still have orphaned decks (folder_id IS NULL),
-- move those decks into their first (lowest sort_order) folder
UPDATE decks d
SET folder_id = (
  SELECT f.id FROM folders f
  WHERE f.user_id = d.user_id
    AND f.is_archived = false
    AND f.parent_id IS NULL
  ORDER BY f.sort_order ASC, f.created_at ASC
  LIMIT 1
),
updated_at = now()
WHERE d.folder_id IS NULL
  AND d.is_archived = false
  AND EXISTS (
    SELECT 1 FROM folders f WHERE f.user_id = d.user_id AND f.is_archived = false AND f.parent_id IS NULL
  );
