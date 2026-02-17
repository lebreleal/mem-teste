
-- Add is_subscriber column to turma_members
ALTER TABLE public.turma_members 
ADD COLUMN is_subscriber boolean NOT NULL DEFAULT false;
