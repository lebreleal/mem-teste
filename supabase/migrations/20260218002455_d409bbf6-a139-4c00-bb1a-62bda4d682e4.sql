-- Fix the self-referencing folder "Pastas" which points parent_id to itself
UPDATE turma_subjects SET parent_id = NULL WHERE id = '702c3fa0-101f-4274-9845-512ead9911ed' AND parent_id = '702c3fa0-101f-4274-9845-512ead9911ed';

-- Add a CHECK constraint to prevent self-referencing parent_id
ALTER TABLE turma_subjects ADD CONSTRAINT turma_subjects_no_self_parent CHECK (parent_id IS DISTINCT FROM id);