
-- Step 1: Create "Classe de [Nome]" folder for every user who doesn't have one
INSERT INTO folders (user_id, name, section, sort_order)
SELECT DISTINCT p.id, 'Classe de ' || COALESCE(NULLIF(TRIM(p.name), ''), 'Estudante'), 'personal', 0
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM folders f WHERE f.user_id = p.id AND f.name LIKE 'Classe de %'
)
AND EXISTS (
  SELECT 1 FROM decks d WHERE d.user_id = p.id AND d.is_archived = false
);

-- Step 2: Move decks that were incorrectly assigned by the previous migration
-- (updated in the last 2 hours) into the new Classe folder
UPDATE decks d
SET folder_id = (
  SELECT f.id FROM folders f
  WHERE f.user_id = d.user_id
    AND f.name LIKE 'Classe de %'
    AND f.parent_id IS NULL
  ORDER BY f.created_at DESC
  LIMIT 1
),
updated_at = now()
WHERE d.is_archived = false
  AND d.updated_at >= now() - interval '2 hours'
  AND EXISTS (
    SELECT 1 FROM folders f
    WHERE f.user_id = d.user_id AND f.name LIKE 'Classe de %' AND f.parent_id IS NULL
  );
