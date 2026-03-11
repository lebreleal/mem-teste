-- Remove duplicate turma_members rows, keeping only the highest-privilege one per (user_id, turma_id)
DELETE FROM turma_members
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, turma_id) id
  FROM turma_members
  ORDER BY user_id, turma_id, 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'moderator' THEN 2 
      ELSE 3 
    END,
    joined_at ASC
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE turma_members ADD CONSTRAINT turma_members_user_turma_unique UNIQUE (user_id, turma_id);