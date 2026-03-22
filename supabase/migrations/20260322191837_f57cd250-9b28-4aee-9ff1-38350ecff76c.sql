
-- Align deck/subdeck classification bars with last_rating, while preserving legacy cards without last_rating
CREATE OR REPLACE FUNCTION public.get_all_user_card_counts(p_user_id uuid)
RETURNS TABLE(deck_id uuid, total bigint, mastered bigint, novo bigint, facil bigint, bom bigint, dificil bigint, errei bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.deck_id,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE c.state >= 2)::bigint AS mastered,
    COUNT(*) FILTER (WHERE c.state = 0 OR c.state IS NULL)::bigint AS novo,
    COUNT(*) FILTER (
      WHERE c.state > 0
        AND (
          c.last_rating = 4
          OR (c.last_rating IS NULL AND c.difficulty <= 3)
        )
    )::bigint AS facil,
    COUNT(*) FILTER (
      WHERE c.state > 0
        AND (
          c.last_rating = 3
          OR (c.last_rating IS NULL AND c.difficulty > 3 AND c.difficulty <= 5)
        )
    )::bigint AS bom,
    COUNT(*) FILTER (
      WHERE c.state > 0
        AND (
          c.last_rating = 2
          OR (c.last_rating IS NULL AND c.difficulty > 5 AND c.difficulty <= 7)
        )
    )::bigint AS dificil,
    COUNT(*) FILTER (
      WHERE c.state > 0
        AND (
          c.last_rating = 1
          OR (c.last_rating IS NULL AND c.difficulty > 7)
        )
    )::bigint AS errei
  FROM public.cards c
  JOIN public.decks d ON d.id = c.deck_id
  WHERE d.user_id = p_user_id
  GROUP BY c.deck_id;
$$;

CREATE OR REPLACE FUNCTION public.count_descendant_cards_by_state(p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE descendant_decks AS (
    SELECT id FROM public.decks WHERE id = p_deck_id AND user_id = auth.uid()
    UNION ALL
    SELECT d.id FROM public.decks d JOIN descendant_decks dd ON d.parent_deck_id = dd.id
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
      COUNT(*) FILTER (WHERE c.state = 0 OR c.state IS NULL) AS diff_novo,
      COUNT(*) FILTER (
        WHERE c.state > 0
          AND (
            c.last_rating = 4
            OR (c.last_rating IS NULL AND c.difficulty <= 3)
          )
      ) AS diff_facil,
      COUNT(*) FILTER (
        WHERE c.state > 0
          AND (
            c.last_rating = 3
            OR (c.last_rating IS NULL AND c.difficulty > 3 AND c.difficulty <= 5)
          )
      ) AS diff_bom,
      COUNT(*) FILTER (
        WHERE c.state > 0
          AND (
            c.last_rating = 2
            OR (c.last_rating IS NULL AND c.difficulty > 5 AND c.difficulty <= 7)
          )
      ) AS diff_dificil,
      COUNT(*) FILTER (
        WHERE c.state > 0
          AND (
            c.last_rating = 1
            OR (c.last_rating IS NULL AND c.difficulty > 7)
          )
      ) AS diff_errei
    FROM public.cards c
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
