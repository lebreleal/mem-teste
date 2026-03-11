
-- Table for standalone deck questions (independent from exams)
CREATE TABLE public.deck_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  question_text text NOT NULL DEFAULT '',
  question_type text NOT NULL DEFAULT 'multiple_choice',
  options jsonb DEFAULT '[]'::jsonb,
  correct_answer text NOT NULL DEFAULT '',
  correct_indices integer[] DEFAULT NULL,
  explanation text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_deck_questions_deck_id ON public.deck_questions(deck_id);
CREATE INDEX idx_deck_questions_created_by ON public.deck_questions(created_by);

-- RLS
ALTER TABLE public.deck_questions ENABLE ROW LEVEL SECURITY;

-- Deck owners can manage all questions in their decks
CREATE POLICY "Deck owners can manage questions"
  ON public.deck_questions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM decks WHERE decks.id = deck_questions.deck_id AND decks.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM decks WHERE decks.id = deck_questions.deck_id AND decks.user_id = auth.uid()));

-- Anyone authenticated can view questions from public decks
CREATE POLICY "Anyone can view public deck questions"
  ON public.deck_questions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM decks WHERE decks.id = deck_questions.deck_id AND decks.is_public = true));

-- Turma members can view questions from community decks
CREATE POLICY "Turma members can view community deck questions"
  ON public.deck_questions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM turma_decks td
    WHERE td.deck_id = deck_questions.deck_id
    AND is_turma_member(auth.uid(), td.turma_id)
  ));

-- Anon can view questions from public community decks
CREATE POLICY "Anon can view public community deck questions"
  ON public.deck_questions FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM turma_decks td
    JOIN turmas t ON t.id = td.turma_id
    WHERE td.deck_id = deck_questions.deck_id
    AND td.is_published = true
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  ));

-- Authenticated can view questions from public community decks
CREATE POLICY "Auth can view public community deck questions"
  ON public.deck_questions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM turma_decks td
    JOIN turmas t ON t.id = td.turma_id
    WHERE td.deck_id = deck_questions.deck_id
    AND td.is_published = true
    AND (t.is_private = false OR t.share_slug IS NOT NULL)
  ));

-- Users who own a copy of the deck can view questions from source
CREATE POLICY "Users can view questions from their linked decks"
  ON public.deck_questions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM decks d
    JOIN turma_decks td ON td.id = d.source_turma_deck_id
    WHERE td.deck_id = deck_questions.deck_id
    AND d.user_id = auth.uid()
  ));

-- Question attempt tracking table
CREATE TABLE public.deck_question_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.deck_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  selected_indices integer[] DEFAULT NULL,
  user_answer text DEFAULT '',
  is_correct boolean NOT NULL DEFAULT false,
  answered_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_dqa_question_id ON public.deck_question_attempts(question_id);
CREATE INDEX idx_dqa_user_id ON public.deck_question_attempts(user_id);

ALTER TABLE public.deck_question_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own attempts"
  ON public.deck_question_attempts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
