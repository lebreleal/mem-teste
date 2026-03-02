CREATE OR REPLACE FUNCTION public.sync_turma_folder_names()
RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.folders
    SET name = NEW.name, updated_at = now()
    WHERE source_turma_id = NEW.id AND source_turma_subject_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.sync_subject_folder_names()
RETURNS trigger AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.folders
    SET name = NEW.name, updated_at = now()
    WHERE source_turma_subject_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;