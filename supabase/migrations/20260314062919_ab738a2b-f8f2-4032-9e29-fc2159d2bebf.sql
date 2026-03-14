-- Auto-create a turma (sala) for each new user on profile creation
CREATE OR REPLACE FUNCTION public.auto_create_user_sala()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_turma_id uuid;
BEGIN
  -- Only create if user doesn't already have a turma
  IF NOT EXISTS (SELECT 1 FROM turmas WHERE owner_id = NEW.id) THEN
    INSERT INTO turmas (name, description, owner_id, is_private)
    VALUES (COALESCE(NULLIF(NEW.name, ''), 'Minha Sala'), '', NEW.id, true)
    RETURNING id INTO new_turma_id;
    
    INSERT INTO turma_members (turma_id, user_id, role)
    VALUES (new_turma_id, NEW.id, 'admin');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_profile_created_create_sala ON profiles;
CREATE TRIGGER on_profile_created_create_sala
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_user_sala();

-- Backfill: create turmas for existing users who don't have one
INSERT INTO turmas (name, description, owner_id, is_private)
SELECT COALESCE(NULLIF(p.name, ''), 'Minha Sala'), '', p.id, true
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM turmas t WHERE t.owner_id = p.id);

-- Backfill: create turma_members for owners who aren't members yet
INSERT INTO turma_members (turma_id, user_id, role)
SELECT t.id, t.owner_id, 'admin'
FROM turmas t
WHERE NOT EXISTS (SELECT 1 FROM turma_members tm WHERE tm.turma_id = t.id AND tm.user_id = t.owner_id);