
-- ═══════════════════════════════════════════════════════════════
-- 1. Batch Review Insert RPC (Command Pattern)
-- Reduces N individual INSERT calls to 1 single RPC call.
-- Up to 90% reduction in DB round-trips during study sessions.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.insert_review_batch(p_reviews jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_reviews)
  LOOP
    INSERT INTO review_logs (
      user_id, card_id, rating, stability, difficulty,
      scheduled_date, state, elapsed_ms
    ) VALUES (
      (r->>'user_id')::uuid,
      (r->>'card_id')::uuid,
      (r->>'rating')::integer,
      COALESCE((r->>'stability')::numeric, 0),
      COALESCE((r->>'difficulty')::numeric, 0),
      COALESCE(r->>'scheduled_date', now()::text),
      (r->>'state')::integer,
      (r->>'elapsed_ms')::integer
    );
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Performance Summary RPC (Interface Segregation Principle)
-- Single query replaces N+1 queries in usePerformance hook.
-- Returns per-deck retention, card counts, and review trends.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_performance_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'subjects', COALESCE((
      SELECT jsonb_agg(sub ORDER BY sub.avg_retention ASC)
      FROM (
        SELECT
          d.id AS "subjectId",
          d.name AS "subjectName",
          COUNT(c.*) AS "totalCards",
          COUNT(*) FILTER (WHERE c.state = 0) AS "newCards",
          COUNT(*) FILTER (WHERE c.state = 2 AND c.scheduled_date <= now()) AS "reviewCards",
          COALESCE(
            ROUND(AVG(
              CASE WHEN c.state != 0 AND c.stability > 0 THEN
                POWER(1.0 + (19.0/81.0) * GREATEST(0,
                  EXTRACT(EPOCH FROM (now() - COALESCE(c.last_reviewed_at, c.created_at))) / 86400.0
                ) / GREATEST(0.1, c.stability), -0.5) * 100
              END
            ))::integer, 0
          ) AS avg_retention,
          MAX(c.last_reviewed_at) AS "lastReviewAt",
          jsonb_build_object(
            'basic', COUNT(*) FILTER (WHERE c.card_type = 'basic' AND (c.state = 0 OR (c.state = 2 AND c.scheduled_date <= now()))),
            'cloze', COUNT(*) FILTER (WHERE c.card_type = 'cloze' AND (c.state = 0 OR (c.state = 2 AND c.scheduled_date <= now()))),
            'multiple_choice', COUNT(*) FILTER (WHERE c.card_type = 'multiple_choice' AND (c.state = 0 OR (c.state = 2 AND c.scheduled_date <= now()))),
            'image_occlusion', COUNT(*) FILTER (WHERE c.card_type = 'image_occlusion' AND (c.state = 0 OR (c.state = 2 AND c.scheduled_date <= now())))
          ) AS "todayCardTypes"
        FROM decks d
        JOIN cards c ON c.deck_id = d.id
        WHERE d.user_id = p_user_id
          AND d.is_archived = false
          AND d.parent_deck_id IS NULL
        GROUP BY d.id, d.name
        HAVING COUNT(c.*) > 0
      ) sub
    ), '[]'::jsonb),
    'totalPendingReviews', COALESCE((
      SELECT COUNT(*)
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE d.user_id = p_user_id AND d.is_archived = false
        AND c.state = 2 AND c.scheduled_date <= now()
    ), 0),
    'totalNewCards', COALESCE((
      SELECT COUNT(*)
      FROM cards c
      JOIN decks d ON d.id = c.deck_id
      WHERE d.user_id = p_user_id AND d.is_archived = false
        AND c.state = 0
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
