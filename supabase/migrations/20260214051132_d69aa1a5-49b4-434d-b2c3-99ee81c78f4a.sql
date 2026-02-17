
-- Exams table
CREATE TABLE public.exams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed'
  total_points NUMERIC NOT NULL DEFAULT 0,
  scored_points NUMERIC NOT NULL DEFAULT 0,
  time_limit_seconds INTEGER, -- null = no limit
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exams" ON public.exams FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own exams" ON public.exams FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exams" ON public.exams FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exams" ON public.exams FOR DELETE USING (auth.uid() = user_id);

-- Exam questions table
CREATE TABLE public.exam_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL DEFAULT 'written', -- 'written', 'multiple_choice', 'multi_select'
  question_text TEXT NOT NULL,
  options JSONB, -- for MC: ["opt1","opt2",...] 
  correct_answer TEXT NOT NULL DEFAULT '', -- for written: expected answer text
  correct_indices INTEGER[], -- for MC/multi-select: array of correct option indices
  points NUMERIC NOT NULL DEFAULT 1,
  user_answer TEXT, -- written answer
  selected_indices INTEGER[], -- user's MC selections
  scored_points NUMERIC NOT NULL DEFAULT 0,
  is_graded BOOLEAN NOT NULL DEFAULT false,
  ai_feedback TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exam questions" ON public.exam_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.exams WHERE exams.id = exam_questions.exam_id AND exams.user_id = auth.uid()));
CREATE POLICY "Users can insert own exam questions" ON public.exam_questions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.exams WHERE exams.id = exam_questions.exam_id AND exams.user_id = auth.uid()));
CREATE POLICY "Users can update own exam questions" ON public.exam_questions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.exams WHERE exams.id = exam_questions.exam_id AND exams.user_id = auth.uid()));
CREATE POLICY "Users can delete own exam questions" ON public.exam_questions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.exams WHERE exams.id = exam_questions.exam_id AND exams.user_id = auth.uid()));

-- Track daily free grading counter on profiles
ALTER TABLE public.profiles ADD COLUMN daily_free_gradings INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN last_grading_reset_date DATE;
