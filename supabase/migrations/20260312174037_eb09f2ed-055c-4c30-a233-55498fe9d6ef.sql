
-- 1. Global concepts table with FSRS fields
CREATE TABLE public.global_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  state integer NOT NULL DEFAULT 0,
  stability double precision NOT NULL DEFAULT 0,
  difficulty double precision NOT NULL DEFAULT 0,
  scheduled_date timestamp with time zone NOT NULL DEFAULT now(),
  learning_step integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamp with time zone,
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

-- 2. Question-concept linking table
CREATE TABLE public.question_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.deck_questions(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.global_concepts(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(question_id, concept_id)
);

-- 3. Enable RLS
ALTER TABLE public.global_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_concepts ENABLE ROW LEVEL SECURITY;

-- 4. RLS for global_concepts
CREATE POLICY "Users can manage own global concepts"
  ON public.global_concepts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. RLS for question_concepts
CREATE POLICY "Users can view own question concepts"
  ON public.question_concepts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.global_concepts gc
    WHERE gc.id = question_concepts.concept_id AND gc.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own question concepts"
  ON public.question_concepts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.global_concepts gc
    WHERE gc.id = question_concepts.concept_id AND gc.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own question concepts"
  ON public.question_concepts FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.global_concepts gc
    WHERE gc.id = question_concepts.concept_id AND gc.user_id = auth.uid()
  ));

-- 6. Indexes for performance
CREATE INDEX idx_global_concepts_user_scheduled ON public.global_concepts(user_id, scheduled_date);
CREATE INDEX idx_global_concepts_user_slug ON public.global_concepts(user_id, slug);
CREATE INDEX idx_question_concepts_concept ON public.question_concepts(concept_id);
CREATE INDEX idx_question_concepts_question ON public.question_concepts(question_id);
