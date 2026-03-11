
-- Add concepts column to deck_questions
ALTER TABLE deck_questions ADD COLUMN IF NOT EXISTS concepts text[] DEFAULT '{}';

-- Create concept mastery tracking table
CREATE TABLE IF NOT EXISTS public.deck_concept_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  concept text NOT NULL,
  correct_count int NOT NULL DEFAULT 0,
  wrong_count int NOT NULL DEFAULT 0,
  mastery_level text NOT NULL DEFAULT 'weak',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, deck_id, concept)
);

-- Enable RLS
ALTER TABLE public.deck_concept_mastery ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage own concept mastery
CREATE POLICY "Users can manage own concept mastery"
  ON public.deck_concept_mastery
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
