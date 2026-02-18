-- Replace the trigger function for turma_exams to not bump updated_at when only sort_order changes
CREATE OR REPLACE FUNCTION public.update_turma_exams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip updating updated_at if only sort_order changed
  IF (OLD.sort_order IS DISTINCT FROM NEW.sort_order) AND
     OLD.title = NEW.title AND
     OLD.description IS NOT DISTINCT FROM NEW.description AND
     OLD.total_questions = NEW.total_questions AND
     OLD.time_limit_seconds IS NOT DISTINCT FROM NEW.time_limit_seconds AND
     OLD.subscribers_only = NEW.subscribers_only AND
     OLD.is_published = NEW.is_published THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Recreate trigger using the new function
DROP TRIGGER IF EXISTS update_turma_exams_updated_at ON turma_exams;
CREATE TRIGGER update_turma_exams_updated_at
  BEFORE UPDATE ON turma_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_turma_exams_updated_at();