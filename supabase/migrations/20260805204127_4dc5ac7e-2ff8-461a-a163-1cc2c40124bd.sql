DO $$
DECLARE
  r RECORD;
  v_folder_id uuid;
  v_sala_id uuid;
  v_section text;
  v_has_cards boolean;
  v_referenced boolean;
BEGIN
  FOR r IN
    SELECT d.* FROM public.decks d
    WHERE d.parent_deck_id IS NULL
      AND d.is_archived = false
      AND EXISTS (SELECT 1 FROM public.decks c WHERE c.parent_deck_id = d.id AND c.is_archived = false)
  LOOP
    -- resolve target sala (level-1 folder)
    IF r.folder_id IS NOT NULL THEN
      SELECT COALESCE(f.parent_id, f.id), COALESCE(f.section, 'personal')
        INTO v_sala_id, v_section
      FROM public.folders f WHERE f.id = r.folder_id;
    ELSE
      SELECT id INTO v_sala_id FROM public.folders
        WHERE user_id = r.user_id AND name = 'Decks sem Sala' AND parent_id IS NULL AND is_archived = false
        LIMIT 1;
      IF v_sala_id IS NULL THEN
        INSERT INTO public.folders (user_id, name, parent_id, section, sort_order)
        VALUES (r.user_id, 'Decks sem Sala', NULL, 'personal', 9999)
        RETURNING id INTO v_sala_id;
      END IF;
      v_section := 'personal';
    END IF;

    INSERT INTO public.folders (user_id, name, parent_id, section, sort_order)
    VALUES (r.user_id, r.name, v_sala_id, COALESCE(v_section, 'personal'), COALESCE(r.sort_order, 0))
    RETURNING id INTO v_folder_id;

    -- move every descendant (recursive) into the new folder as a flat deck
    WITH RECURSIVE tree AS (
      SELECT id FROM public.decks WHERE parent_deck_id = r.id
      UNION ALL
      SELECT d.id FROM public.decks d JOIN tree t ON d.parent_deck_id = t.id
    )
    UPDATE public.decks d
       SET parent_deck_id = NULL,
           folder_id = v_folder_id,
           updated_at = now()
     WHERE d.id IN (SELECT id FROM tree);

    -- the old parent deck itself
    SELECT EXISTS (SELECT 1 FROM public.cards c WHERE c.deck_id = r.id) INTO v_has_cards;
    IF v_has_cards THEN
      UPDATE public.decks
         SET name = 'Geral', folder_id = v_folder_id, parent_deck_id = NULL, updated_at = now()
       WHERE id = r.id;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.turma_decks t WHERE t.deck_id = r.id)
          OR EXISTS (SELECT 1 FROM public.marketplace_listings m WHERE m.deck_id = r.id)
          OR EXISTS (SELECT 1 FROM public.exams e WHERE e.deck_id = r.id)
          OR EXISTS (SELECT 1 FROM public.deck_access_codes a WHERE a.deck_id = r.id)
          OR EXISTS (SELECT 1 FROM public.deck_questions q WHERE q.deck_id = r.id)
        INTO v_referenced;
      IF v_referenced THEN
        UPDATE public.decks
           SET is_archived = true, folder_id = v_folder_id, parent_deck_id = NULL, updated_at = now()
         WHERE id = r.id;
      ELSE
        DELETE FROM public.decks WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;

  -- any leftover archived sub-decks become flat decks under their nearest folder
  UPDATE public.decks d
     SET folder_id = COALESCE(d.folder_id, p.folder_id),
         parent_deck_id = NULL
    FROM public.decks p
   WHERE d.parent_deck_id = p.id;
END $$;

-- enforce max depth: Sala > Pasta (no folder grandchildren)
CREATE OR REPLACE FUNCTION public.enforce_folder_depth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.folders f WHERE f.id = NEW.parent_id AND f.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Pastas só podem ter dois níveis (Sala > Pasta)';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.folders f WHERE f.parent_id = NEW.id) AND NEW.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta pasta já contém pastas e não pode virar subpasta';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_folder_depth ON public.folders;
CREATE TRIGGER trg_enforce_folder_depth
BEFORE INSERT OR UPDATE OF parent_id ON public.folders
FOR EACH ROW EXECUTE FUNCTION public.enforce_folder_depth();