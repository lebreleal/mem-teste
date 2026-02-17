
-- 1. Rename wallet_balance to memocoins in profiles
ALTER TABLE public.profiles RENAME COLUMN wallet_balance TO memocoins;

-- 2. Rename wallet_transactions to memocoin_transactions
ALTER TABLE public.wallet_transactions RENAME TO memocoin_transactions;

-- 3. Create turma_exams table (exams created within a turma context)
CREATE TABLE public.turma_exams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.turma_subjects(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.turma_lessons(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  time_limit_seconds INTEGER,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_marketplace BOOLEAN NOT NULL DEFAULT false,
  price NUMERIC NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  avg_rating NUMERIC DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view published turma exams"
  ON public.turma_exams FOR SELECT
  USING (is_turma_member(auth.uid(), turma_id) OR (is_marketplace = true AND is_published = true));

CREATE POLICY "Permitted users can create turma exams"
  ON public.turma_exams FOR INSERT
  WITH CHECK (has_turma_permission(auth.uid(), turma_id, 'create_exam'));

CREATE POLICY "Creator or admin can update turma exams"
  ON public.turma_exams FOR UPDATE
  USING (created_by = auth.uid() OR get_turma_role(auth.uid(), turma_id) = 'admin');

CREATE POLICY "Creator or admin can delete turma exams"
  ON public.turma_exams FOR DELETE
  USING (created_by = auth.uid() OR get_turma_role(auth.uid(), turma_id) = 'admin');

-- 4. Create turma_exam_questions (questions selected for a turma exam)
CREATE TABLE public.turma_exam_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES public.turma_exams(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.turma_questions(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'written',
  options JSONB,
  correct_answer TEXT NOT NULL DEFAULT '',
  correct_indices INTEGER[],
  points NUMERIC NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view exam questions"
  ON public.turma_exam_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.turma_exams te
    WHERE te.id = exam_id AND (is_turma_member(auth.uid(), te.turma_id) OR (te.is_marketplace = true AND te.is_published = true))
  ));

CREATE POLICY "Exam creator can manage questions"
  ON public.turma_exam_questions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.turma_exams te
    WHERE te.id = exam_id AND (te.created_by = auth.uid() OR get_turma_role(auth.uid(), te.turma_id) = 'admin')
  ));

CREATE POLICY "Exam creator can update questions"
  ON public.turma_exam_questions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.turma_exams te
    WHERE te.id = exam_id AND (te.created_by = auth.uid() OR get_turma_role(auth.uid(), te.turma_id) = 'admin')
  ));

CREATE POLICY "Exam creator can delete questions"
  ON public.turma_exam_questions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.turma_exams te
    WHERE te.id = exam_id AND (te.created_by = auth.uid() OR get_turma_role(auth.uid(), te.turma_id) = 'admin')
  ));

-- 5. Turma exam attempts (members taking exams)
CREATE TABLE public.turma_exam_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES public.turma_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  scored_points NUMERIC NOT NULL DEFAULT 0,
  total_points NUMERIC NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attempts"
  ON public.turma_exam_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own attempts"
  ON public.turma_exam_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own attempts"
  ON public.turma_exam_attempts FOR UPDATE
  USING (auth.uid() = user_id);

-- Attempt answers
CREATE TABLE public.turma_exam_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.turma_exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.turma_exam_questions(id) ON DELETE CASCADE,
  user_answer TEXT,
  selected_indices INTEGER[],
  scored_points NUMERIC NOT NULL DEFAULT 0,
  is_graded BOOLEAN NOT NULL DEFAULT false,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turma_exam_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own answers"
  ON public.turma_exam_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.turma_exam_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own answers"
  ON public.turma_exam_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.turma_exam_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own answers"
  ON public.turma_exam_answers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.turma_exam_attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid()
  ));

-- Update trigger for turma_exams
CREATE TRIGGER update_turma_exams_updated_at
  BEFORE UPDATE ON public.turma_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
