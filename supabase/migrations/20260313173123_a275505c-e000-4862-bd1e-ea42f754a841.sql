CREATE OR REPLACE FUNCTION public.get_deck_concept_names(p_deck_id uuid, p_user_id uuid)
RETURNS TABLE(name text) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT gc.name
  FROM question_concepts qc
  JOIN global_concepts gc ON gc.id = qc.concept_id
  JOIN deck_questions dq ON dq.id = qc.question_id
  WHERE dq.deck_id = p_deck_id
    AND gc.user_id = p_user_id
  LIMIT 200;
$$;