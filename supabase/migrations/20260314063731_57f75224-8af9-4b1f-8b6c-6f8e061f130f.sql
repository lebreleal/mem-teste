
-- 1. For existing users who have decks NOT inside any folder, create a "MEDICINA" folder and move orphan decks into it
DO $$
DECLARE
  r RECORD;
  new_folder_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT d.user_id
    FROM decks d
    WHERE d.folder_id IS NULL
      AND d.parent_deck_id IS NULL
      AND d.is_archived = false
      AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.user_id = d.user_id AND f.parent_id IS NULL AND f.is_archived = false)
  LOOP
    INSERT INTO folders (user_id, name, section, sort_order)
    VALUES (r.user_id, 'MEDICINA', 'personal', 0)
    RETURNING id INTO new_folder_id;

    UPDATE decks
    SET folder_id = new_folder_id
    WHERE user_id = r.user_id
      AND folder_id IS NULL
      AND parent_deck_id IS NULL;
  END LOOP;
END;
$$;

-- 2. Update the auto-create trigger to create a folder "Classe de [name]" for new users
CREATE OR REPLACE FUNCTION public.auto_create_user_sala()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_turma_id uuid;
  display_name text;
BEGIN
  display_name := COALESCE(NULLIF(TRIM(NEW.name), ''), 'Estudante');

  -- Auto-create turma for sharing
  IF NOT EXISTS (SELECT 1 FROM turmas WHERE owner_id = NEW.id) THEN
    INSERT INTO turmas (name, description, owner_id, is_private)
    VALUES ('Classe de ' || display_name, '', NEW.id, true)
    RETURNING id INTO new_turma_id;
    
    INSERT INTO turma_members (turma_id, user_id, role)
    VALUES (new_turma_id, NEW.id, 'admin');
  END IF;

  -- Auto-create default folder
  IF NOT EXISTS (SELECT 1 FROM folders WHERE user_id = NEW.id) THEN
    INSERT INTO folders (user_id, name, section, sort_order)
    VALUES (NEW.id, 'Classe de ' || display_name, 'personal', 0);
  END IF;
  
  RETURN NEW;
END;
$$;
