
-- Fix: Change "Classe de" to "Sala de" + first name only

-- 1. Update the trigger function
CREATE OR REPLACE FUNCTION public.auto_create_user_sala()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_turma_id uuid;
  first_name text;
BEGIN
  first_name := COALESCE(NULLIF(TRIM(split_part(NEW.name, ' ', 1)), ''), 'Estudante');

  -- Auto-create turma for sharing
  IF NOT EXISTS (SELECT 1 FROM turmas WHERE owner_id = NEW.id) THEN
    INSERT INTO turmas (name, description, owner_id, is_private)
    VALUES ('Sala de ' || first_name, '', NEW.id, true)
    RETURNING id INTO new_turma_id;
    
    INSERT INTO turma_members (turma_id, user_id, role)
    VALUES (new_turma_id, NEW.id, 'admin');
  END IF;

  -- Auto-create default folder
  IF NOT EXISTS (SELECT 1 FROM folders WHERE user_id = NEW.id) THEN
    INSERT INTO folders (user_id, name, section, sort_order)
    VALUES (NEW.id, 'Sala de ' || first_name, 'personal', 0);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Rename existing "Classe de ..." folders to "Sala de [first name]"
UPDATE folders f
SET name = 'Sala de ' || COALESCE(NULLIF(TRIM(split_part(p.name, ' ', 1)), ''), 'Estudante')
FROM profiles p
WHERE f.user_id = p.id
  AND f.name LIKE 'Classe de %'
  AND f.parent_id IS NULL;

-- 3. Rename existing "Classe de ..." turmas to "Sala de [first name]"
UPDATE turmas t
SET name = 'Sala de ' || COALESCE(NULLIF(TRIM(split_part(p.name, ' ', 1)), ''), 'Estudante')
FROM profiles p
WHERE t.owner_id = p.id
  AND t.name LIKE 'Classe de %';
