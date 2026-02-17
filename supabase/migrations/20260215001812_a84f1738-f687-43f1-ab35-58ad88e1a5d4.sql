
-- Mission definitions table (admin-defined missions)
CREATE TABLE public.mission_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE, -- unique identifier like 'daily_study_30', 'weekly_streak_5'
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'star', -- lucide icon name
  category text NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'achievement'
  target_value integer NOT NULL DEFAULT 1, -- e.g. study 30 cards, 5 day streak
  target_type text NOT NULL DEFAULT 'cards_studied', -- what to measure
  reward_credits integer NOT NULL DEFAULT 5, -- AI credits reward
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User mission progress table
CREATE TABLE public.user_missions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  mission_id uuid NOT NULL REFERENCES public.mission_definitions(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  is_claimed boolean NOT NULL DEFAULT false, -- reward claimed
  period_start date NOT NULL DEFAULT CURRENT_DATE, -- for daily/weekly reset tracking
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mission_id, period_start)
);

-- Enable RLS
ALTER TABLE public.mission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;

-- Mission definitions: anyone authenticated can read
CREATE POLICY "Anyone authenticated can view missions"
  ON public.mission_definitions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- User missions: users can only see/manage their own
CREATE POLICY "Users can view own missions"
  ON public.user_missions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own missions"
  ON public.user_missions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own missions"
  ON public.user_missions FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_missions_updated_at
  BEFORE UPDATE ON public.user_missions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial mission definitions
INSERT INTO public.mission_definitions (key, title, description, icon, category, target_value, target_type, reward_credits, sort_order) VALUES
  -- Daily missions
  ('daily_study_10', 'Estudar 10 cards', 'Revise ou estude 10 flashcards hoje', 'book-open', 'daily', 10, 'cards_studied', 5, 1),
  ('daily_study_30', 'Estudar 30 cards', 'Revise ou estude 30 flashcards hoje', 'book-open', 'daily', 30, 'cards_studied', 10, 2),
  ('daily_study_50', 'Estudar 50 cards', 'Revise ou estude 50 flashcards hoje', 'zap', 'daily', 50, 'cards_studied', 15, 3),
  ('daily_time_15', '15 minutos de estudo', 'Estude por pelo menos 15 minutos hoje', 'clock', 'daily', 15, 'minutes_studied', 5, 4),
  ('daily_time_30', '30 minutos de estudo', 'Estude por pelo menos 30 minutos hoje', 'clock', 'daily', 30, 'minutes_studied', 10, 5),
  -- Weekly missions
  ('weekly_streak_3', 'Ofensiva de 3 dias', 'Mantenha uma ofensiva de 3 dias esta semana', 'flame', 'weekly', 3, 'streak', 15, 1),
  ('weekly_streak_5', 'Ofensiva de 5 dias', 'Mantenha uma ofensiva de 5 dias esta semana', 'flame', 'weekly', 5, 'streak', 25, 2),
  ('weekly_study_100', 'Estudar 100 cards', 'Estude 100 cards durante a semana', 'brain', 'weekly', 100, 'cards_studied_week', 20, 3),
  ('weekly_study_200', 'Estudar 200 cards', 'Estude 200 cards durante a semana', 'brain', 'weekly', 200, 'cards_studied_week', 40, 4),
  -- Achievements (one-time)
  ('ach_first_deck', 'Primeiro baralho', 'Crie seu primeiro baralho', 'sparkles', 'achievement', 1, 'decks_created', 50, 1),
  ('ach_study_500', 'Estudioso', 'Estude 500 cards no total', 'trophy', 'achievement', 500, 'total_cards_studied', 75, 2),
  ('ach_study_1000', 'Mestre do Estudo', 'Estude 1000 cards no total', 'award', 'achievement', 1000, 'total_cards_studied', 100, 3),
  ('ach_streak_7', 'Uma semana firme', 'Alcance uma ofensiva de 7 dias', 'flame', 'achievement', 7, 'max_streak', 50, 4),
  ('ach_streak_30', 'Um mês dedicado', 'Alcance uma ofensiva de 30 dias', 'crown', 'achievement', 30, 'max_streak', 100, 5);
