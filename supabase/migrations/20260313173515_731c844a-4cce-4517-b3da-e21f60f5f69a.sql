-- Delete all question_concepts data
DELETE FROM question_concepts;

-- Delete all global_concepts data
DELETE FROM global_concepts;

-- Add context_description to question_concepts (how this concept relates to THIS question)
ALTER TABLE question_concepts ADD COLUMN IF NOT EXISTS context_description text;