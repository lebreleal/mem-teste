
-- RPC 1: Get a page of cards from a deck and all its descendants
CREATE OR REPLACE FUNCTION public.get_descendant_cards_page(
  p_deck_id uuid,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.cards
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE descendant_decks AS (
    SELECT id FROM decks WHERE id = p_deck_id AND user_id = auth.uid()
    UNION ALL
    SELECT d.id FROM decks d JOIN descendant_decks dd ON d.parent_deck_id = dd.id
  )
  SELECT c.* FROM cards c
  WHERE c.deck_id IN (SELECT id FROM descendant_decks)
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- RPC 2: Count cards by state and type for a deck and all descendants
CREATE OR REPLACE FUNCTION public.count_descendant_cards_by_state(p_deck_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE descendant_decks AS (
    SELECT id FROM decks WHERE id = p_deck_id AND user_id = auth.uid()
    UNION ALL
    SELECT d.id FROM decks d JOIN descendant_decks dd ON d.parent_deck_id = dd.id
  ),
  counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.state = 0 OR c.state IS NULL) AS new_count,
      COUNT(*) FILTER (WHERE c.state IN (1, 3)) AS learning_count,
      COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS review_count,
      COUNT(*) FILTER (WHERE c.card_type = 'basic') AS basic_count,
      COUNT(*) FILTER (WHERE c.card_type = 'cloze') AS cloze_count,
      COUNT(*) FILTER (WHERE c.card_type = 'multiple_choice') AS mc_count,
      COUNT(*) FILTER (WHERE c.card_type = 'image_occlusion') AS occlusion_count,
      COUNT(*) FILTER (WHERE c.state = 4) AS frozen_count
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
    'frozen_count', frozen_count
  ) FROM counts;
$$;
