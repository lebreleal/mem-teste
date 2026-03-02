-- Add columns to link personal folders to turma/subject for auto-sync
ALTER TABLE public.folders 
  ADD COLUMN IF NOT EXISTS source_turma_id uuid REFERENCES public.turmas(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_turma_subject_id uuid REFERENCES public.turma_subjects(id) ON DELETE SET NULL DEFAULT NULL;

-- Index for fast lookup when syncing names
CREATE INDEX IF NOT EXISTS idx_folders_source_turma_id ON public.folders(source_turma_id) WHERE source_turma_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_folders_source_turma_subject_id ON public.folders(source_turma_subject_id) WHERE source_turma_subject_id IS NOT NULL;

-- Function to auto-sync linked folder names when turma name changes
CREATE OR REPLACE FUNCTION sync_turma_folder_names()
RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.folders
    SET name = NEW.name, updated_at = now()
    WHERE source_turma_id = NEW.id AND source_turma_subject_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-sync linked folder names when subject name changes
CREATE OR REPLACE FUNCTION sync_subject_folder_names()
RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.folders
    SET name = NEW.name, updated_at = now()
    WHERE source_turma_subject_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers
DROP TRIGGER IF EXISTS trg_sync_turma_folder_names ON public.turmas;
CREATE TRIGGER trg_sync_turma_folder_names
  AFTER UPDATE ON public.turmas
  FOR EACH ROW EXECUTE FUNCTION sync_turma_folder_names();

DROP TRIGGER IF EXISTS trg_sync_subject_folder_names ON public.turma_subjects;
CREATE TRIGGER trg_sync_subject_folder_names
  AFTER UPDATE ON public.turma_subjects
  FOR EACH ROW EXECUTE FUNCTION sync_subject_folder_names();