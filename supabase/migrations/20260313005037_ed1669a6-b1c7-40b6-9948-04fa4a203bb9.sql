-- Atomic increment for concept mastery counts (avoids race conditions)
CREATE OR REPLACE FUNCTION public.increment_concept_count(
  p_concept_id uuid,
  p_field text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field = 'correct_count' THEN
    UPDATE global_concepts
    SET correct_count = correct_count + 1, updated_at = now()
    WHERE id = p_concept_id AND user_id = auth.uid();
  ELSIF p_field = 'wrong_count' THEN
    UPDATE global_concepts
    SET wrong_count = wrong_count + 1, updated_at = now()
    WHERE id = p_concept_id AND user_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;
END;
$$;