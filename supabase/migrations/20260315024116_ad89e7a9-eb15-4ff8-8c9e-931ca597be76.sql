
-- Update count_descendant_cards_by_state to include difficulty distribution buckets
CREATE OR REPLACE FUNCTION public.count_descendant_cards_by_state(p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE descendant_decks AS (
    SELECT id FROM decks WHERE id = p_deck_id AND user_id = auth.uid()
    UNION ALL
    SELECT d.id FROM decks d JOIN descendant_decks dd ON d.parent_deck_id = dd.id
  ),
  counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE (c.state = 0 OR c.state IS NULL) AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS new_count,
      COUNT(*) FILTER (WHERE c.state IN (1, 3) AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS learning_count,
      COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now() AND c.scheduled_date <= now() + interval '50 years') AS review_count,
      COUNT(*) FILTER (WHERE c.card_type = 'basic') AS basic_count,
      COUNT(*) FILTER (WHERE c.card_type = 'cloze') AS cloze_count,
      COUNT(*) FILTER (WHERE c.card_type = 'multiple_choice') AS mc_count,
      COUNT(*) FILTER (WHERE c.card_type = 'image_occlusion') AS occlusion_count,
      COUNT(*) FILTER (WHERE c.scheduled_date > now() + interval '50 years') AS frozen_count,
      -- Difficulty distribution buckets
      COUNT(*) FILTER (WHERE (c.state = 0 OR c.state IS NULL) AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS diff_novo,
      COUNT(*) FILTER (WHERE c.state > 0 AND c.difficulty <= 3 AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS diff_facil,
      COUNT(*) FILTER (WHERE c.state > 0 AND c.difficulty > 3 AND c.difficulty <= 5 AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS diff_bom,
      COUNT(*) FILTER (WHERE c.state > 0 AND c.difficulty > 5 AND c.difficulty <= 7 AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS diff_dificil,
      COUNT(*) FILTER (WHERE c.state > 0 AND c.difficulty > 7 AND (c.scheduled_date IS NULL OR c.scheduled_date <= now() + interval '50 years')) AS diff_errei
    FROM cards c
    WHERE c.deck_id IN (SELECT id FROM descendant_decks)
  )
  SELECT jsonb_build_object(
    'total', total,
    'new_count', new_count,
    'learning_count', learning_count,
    'review_count', review_count,
    'basic_count', basic_count,
    'cloze_count', cloze_count,
    'mc_count', mc_count,
    'occlusion_count', occlusion_count,
    'frozen_count', frozen_count,
    'diff_novo', diff_novo,
    'diff_facil', diff_facil,
    'diff_bom', diff_bom,
    'diff_dificil', diff_dificil,
    'diff_errei', diff_errei
  ) FROM counts;
$function$;
