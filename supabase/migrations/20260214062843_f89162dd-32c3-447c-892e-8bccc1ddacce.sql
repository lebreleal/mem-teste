
-- ============================================================
-- 1. ENUM for turma member roles
-- ============================================================
CREATE TYPE public.turma_role AS ENUM ('admin', 'moderator', 'member');

-- ============================================================
-- 2. Add role column to turma_members (default 'member', existing rows stay 'member')
-- ============================================================
ALTER TABLE public.turma_members 
  ADD COLUMN role public.turma_role NOT NULL DEFAULT 'member';

-- Set the original creator (owner) as admin in existing turma_members
UPDATE public.turma_members tm
SET role = 'admin'
FROM public.turmas t
WHERE tm.turma_id = t.id AND tm.user_id = t.owner_id;

-- ============================================================
-- 3. Turma Subjects (Matérias)
-- ============================================================
CREATE TABLE public.turma_subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_subjects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Turma Lessons (Aulas) — belong to a Subject
-- ============================================================
CREATE TABLE public.turma_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES public.turma_subjects(id) ON DELETE CASCADE,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_lessons ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Turma Permissions (granular overrides per member)
--    Actions: 'invite', 'create_subject', 'create_lesson', 'create_deck', 'create_exam', 'manage_members'
-- ============================================================
CREATE TABLE public.turma_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  permission TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(turma_id, user_id, permission)
);

ALTER TABLE public.turma_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. Turma Decks — link decks to turma hierarchy
-- ============================================================
CREATE TABLE public.turma_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.turma_subjects(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.turma_lessons(id) ON DELETE SET NULL,
  shared_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(turma_id, deck_id)
);

ALTER TABLE public.turma_decks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. Turma Question Bank
-- ============================================================
CREATE TABLE public.turma_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.turma_subjects(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.turma_lessons(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'written',
  options JSONB,
  correct_answer TEXT NOT NULL DEFAULT '',
  correct_indices INTEGER[],
  points NUMERIC NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. Security definer helpers
-- ============================================================

-- Get a member's role in a turma
CREATE OR REPLACE FUNCTION public.get_turma_role(_user_id UUID, _turma_id UUID)
RETURNS public.turma_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.turma_members
  WHERE user_id = _user_id AND turma_id = _turma_id
  LIMIT 1;
$$;

-- Check if user has a specific permission (hybrid: role defaults + overrides)
CREATE OR REPLACE FUNCTION public.has_turma_permission(_user_id UUID, _turma_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.turma_role;
  _override BOOLEAN;
BEGIN
  -- Get role
  SELECT role INTO _role FROM public.turma_members
  WHERE user_id = _user_id AND turma_id = _turma_id;
  
  IF _role IS NULL THEN RETURN FALSE; END IF;
  
  -- Admin has all permissions
  IF _role = 'admin' THEN RETURN TRUE; END IF;
  
  -- Check for override
  SELECT granted INTO _override FROM public.turma_permissions
  WHERE turma_permissions.turma_id = _turma_id 
    AND turma_permissions.user_id = _user_id 
    AND turma_permissions.permission = _permission;
  
  IF _override IS NOT NULL THEN RETURN _override; END IF;
  
  -- Default permissions by role
  IF _role = 'moderator' THEN
    RETURN _permission IN ('invite', 'create_subject', 'create_lesson', 'create_deck', 'create_exam');
  END IF;
  
  -- member defaults
  RETURN _permission IN ('create_deck');
END;
$$;

-- ============================================================
-- 9. RLS Policies
-- ============================================================

-- turma_subjects: members can view, those with permission can create/edit
CREATE POLICY "Members can view subjects"
  ON public.turma_subjects FOR SELECT
  USING (public.is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Permitted users can create subjects"
  ON public.turma_subjects FOR INSERT
  WITH CHECK (public.has_turma_permission(auth.uid(), turma_id, 'create_subject'));

CREATE POLICY "Creator or admin can update subjects"
  ON public.turma_subjects FOR UPDATE
  USING (created_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Creator or admin can delete subjects"
  ON public.turma_subjects FOR DELETE
  USING (created_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- turma_lessons: members can view, those with permission can create/edit
CREATE POLICY "Members can view lessons"
  ON public.turma_lessons FOR SELECT
  USING (public.is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Permitted users can create lessons"
  ON public.turma_lessons FOR INSERT
  WITH CHECK (public.has_turma_permission(auth.uid(), turma_id, 'create_lesson'));

CREATE POLICY "Creator or admin can update lessons"
  ON public.turma_lessons FOR UPDATE
  USING (created_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Creator or admin can delete lessons"
  ON public.turma_lessons FOR DELETE
  USING (created_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- turma_permissions: only admin can manage
CREATE POLICY "Members can view own permissions"
  ON public.turma_permissions FOR SELECT
  USING (user_id = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Admin can manage permissions"
  ON public.turma_permissions FOR INSERT
  WITH CHECK (public.get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Admin can update permissions"
  ON public.turma_permissions FOR UPDATE
  USING (public.get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Admin can delete permissions"
  ON public.turma_permissions FOR DELETE
  USING (public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- turma_decks: members can view, permitted can share
CREATE POLICY "Members can view turma decks"
  ON public.turma_decks FOR SELECT
  USING (public.is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Permitted users can share decks"
  ON public.turma_decks FOR INSERT
  WITH CHECK (public.has_turma_permission(auth.uid(), turma_id, 'create_deck'));

CREATE POLICY "Sharer or admin can remove deck"
  ON public.turma_decks FOR DELETE
  USING (shared_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- turma_questions: members can view, permitted can create
CREATE POLICY "Members can view turma questions"
  ON public.turma_questions FOR SELECT
  USING (public.is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Permitted users can create questions"
  ON public.turma_questions FOR INSERT
  WITH CHECK (public.has_turma_permission(auth.uid(), turma_id, 'create_exam'));

CREATE POLICY "Creator or admin can update questions"
  ON public.turma_questions FOR UPDATE
  USING (created_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Creator or admin can delete questions"
  ON public.turma_questions FOR DELETE
  USING (created_by = auth.uid() OR public.get_turma_role(auth.uid(), turma_id) = 'admin');

-- ============================================================
-- 10. Updated_at triggers
-- ============================================================
CREATE TRIGGER update_turma_subjects_updated_at
  BEFORE UPDATE ON public.turma_subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_turma_lessons_updated_at
  BEFORE UPDATE ON public.turma_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_turma_questions_updated_at
  BEFORE UPDATE ON public.turma_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
