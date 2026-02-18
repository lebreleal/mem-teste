-- Make deck_id nullable on exams table for community-imported exams
ALTER TABLE public.exams ALTER COLUMN deck_id DROP NOT NULL;
