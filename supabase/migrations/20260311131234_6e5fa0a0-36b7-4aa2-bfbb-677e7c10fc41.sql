-- Add explicit section for folder ownership in dashboard tabs
ALTER TABLE public.folders
ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'personal';

-- Backfill defensive (for pre-existing rows)
UPDATE public.folders
SET section = 'personal'
WHERE section IS NULL;

-- Restrict valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'folders_section_valid'
      AND conrelid = 'public.folders'::regclass
  ) THEN
    ALTER TABLE public.folders
    ADD CONSTRAINT folders_section_valid
    CHECK (section IN ('personal', 'community'));
  END IF;
END $$;

-- Query performance for folder navigation by section
CREATE INDEX IF NOT EXISTS idx_folders_user_section_parent
ON public.folders(user_id, section, parent_id);