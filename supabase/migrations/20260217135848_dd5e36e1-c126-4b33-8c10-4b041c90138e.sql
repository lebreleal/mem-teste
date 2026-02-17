
-- ENUMS
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.turma_role AS ENUM ('admin', 'moderator', 'member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TABLES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  energy integer NOT NULL DEFAULT 100,
  memocoins numeric NOT NULL DEFAULT 0,
  creator_tier integer NOT NULL DEFAULT 1,
  successful_cards_counter integer NOT NULL DEFAULT 0,
  daily_cards_studied integer NOT NULL DEFAULT 0,
  daily_energy_earned integer NOT NULL DEFAULT 0,
  daily_free_gradings integer NOT NULL DEFAULT 0,
  last_energy_recharge date,
  last_study_reset_date date,
  last_grading_reset_date date,
  premium_expires_at timestamptz,
  is_banned boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  tier_last_evaluated timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role app_role NOT NULL
);

CREATE TABLE IF NOT EXISTS public.folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.folders(id),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.decks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  folder_id uuid REFERENCES public.folders(id),
  parent_deck_id uuid REFERENCES public.decks(id),
  algorithm_mode text NOT NULL DEFAULT 'sm2',
  daily_new_limit integer NOT NULL DEFAULT 20,
  daily_review_limit integer NOT NULL DEFAULT 100,
  shuffle_cards boolean NOT NULL DEFAULT true,
  easy_bonus integer NOT NULL DEFAULT 130,
  interval_modifier integer NOT NULL DEFAULT 100,
  max_interval integer NOT NULL DEFAULT 1000,
  requested_retention double precision NOT NULL DEFAULT 0.9,
  learning_steps text[] NOT NULL DEFAULT ARRAY['1m','15m'],
  is_archived boolean NOT NULL DEFAULT false,
  source_listing_id uuid,
  source_turma_deck_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  front_content text NOT NULL,
  back_content text NOT NULL,
  card_type text NOT NULL DEFAULT 'basic',
  state integer NOT NULL DEFAULT 0,
  stability double precision NOT NULL DEFAULT 0,
  difficulty double precision NOT NULL DEFAULT 0,
  scheduled_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  stability double precision NOT NULL DEFAULT 0,
  difficulty double precision NOT NULL DEFAULT 0,
  scheduled_date timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.exam_folders(id),
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES public.decks(id),
  seller_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'outros',
  price numeric NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  card_count integer NOT NULL DEFAULT 0,
  downloads integer NOT NULL DEFAULT 0,
  avg_rating numeric DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turmas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  invite_code text NOT NULL DEFAULT gen_random_uuid()::text,
  is_private boolean NOT NULL DEFAULT false,
  cover_image_url text,
  subscription_price numeric NOT NULL DEFAULT 0,
  avg_rating numeric DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role turma_role NOT NULL DEFAULT 'member',
  is_subscriber boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_decks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  subject_id uuid,
  lesson_id uuid,
  shared_by uuid NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  price_type text NOT NULL DEFAULT 'free',
  allow_download boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  subject_id uuid,
  lesson_id uuid,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  time_limit_seconds integer,
  is_published boolean NOT NULL DEFAULT false,
  is_marketplace boolean NOT NULL DEFAULT false,
  subscribers_only boolean NOT NULL DEFAULT false,
  price numeric NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  downloads integer NOT NULL DEFAULT 0,
  avg_rating numeric DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  folder_id uuid,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'in_progress',
  total_points numeric NOT NULL DEFAULT 0,
  scored_points numeric NOT NULL DEFAULT 0,
  time_limit_seconds integer,
  source_turma_exam_id uuid REFERENCES public.turma_exams(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  question_type text NOT NULL DEFAULT 'written',
  question_text text NOT NULL,
  options jsonb,
  correct_answer text NOT NULL DEFAULT '',
  correct_indices integer[],
  points numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  user_answer text,
  selected_indices integer[],
  scored_points numeric NOT NULL DEFAULT 0,
  is_graded boolean NOT NULL DEFAULT false,
  ai_feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id),
  buyer_id uuid NOT NULL,
  price_paid numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deck_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id),
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memocoin_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  description text NOT NULL DEFAULT '',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_semesters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  created_by uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  semester_id uuid REFERENCES public.turma_semesters(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.turma_subjects(id),
  name text NOT NULL,
  description text DEFAULT '',
  created_by uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_lessons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.turma_subjects(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text DEFAULT '',
  summary text DEFAULT '',
  lesson_date date,
  materials jsonb DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_lesson_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.turma_lessons(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  price_type text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.turma_subjects(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.turma_lessons(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  question_type text NOT NULL DEFAULT 'written',
  question_text text NOT NULL,
  options jsonb,
  correct_answer text NOT NULL DEFAULT '',
  correct_indices integer[],
  points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_exam_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.turma_exams(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.turma_questions(id) ON DELETE SET NULL,
  question_type text NOT NULL DEFAULT 'written',
  question_text text NOT NULL,
  options jsonb,
  correct_answer text NOT NULL DEFAULT '',
  correct_indices integer[],
  points numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_exam_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.turma_exams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  scored_points numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_exam_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.turma_exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.turma_exam_questions(id) ON DELETE CASCADE,
  user_answer text,
  selected_indices integer[],
  scored_points numeric NOT NULL DEFAULT 0,
  is_graded boolean NOT NULL DEFAULT false,
  ai_feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.turma_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'geral',
  status text NOT NULL DEFAULT 'open',
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  user_prompt_template text NOT NULL DEFAULT '',
  default_model text NOT NULL DEFAULT 'flash',
  temperature numeric NOT NULL DEFAULT 0.7,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_token_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  feature_key text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  energy_cost integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  error_message text NOT NULL DEFAULT '',
  error_stack text DEFAULT '',
  component_name text DEFAULT '',
  route text DEFAULT '',
  severity text NOT NULL DEFAULT 'error',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mission_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'star',
  category text NOT NULL DEFAULT 'daily',
  target_type text NOT NULL DEFAULT 'cards_studied',
  target_value integer NOT NULL DEFAULT 1,
  reward_credits integer NOT NULL DEFAULT 5,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_missions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  mission_id uuid NOT NULL REFERENCES public.mission_definitions(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  is_claimed boolean NOT NULL DEFAULT false,
  period_start date NOT NULL DEFAULT CURRENT_DATE,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK adicionais
DO $$ BEGIN ALTER TABLE public.decks ADD CONSTRAINT decks_source_listing_id_fkey FOREIGN KEY (source_listing_id) REFERENCES public.marketplace_listings(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.decks ADD CONSTRAINT decks_source_turma_deck_id_fkey FOREIGN KEY (source_turma_deck_id) REFERENCES public.turma_decks(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.exams ADD CONSTRAINT exams_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.exam_folders(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add FKs for turma_decks
DO $$ BEGIN ALTER TABLE public.turma_decks ADD CONSTRAINT turma_decks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.turma_subjects(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.turma_decks ADD CONSTRAINT turma_decks_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.turma_lessons(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.turma_exams ADD CONSTRAINT turma_exams_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.turma_subjects(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.turma_exams ADD CONSTRAINT turma_exams_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.turma_lessons(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS enable all
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memocoin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_lesson_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON public.cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_state ON public.cards(state);
CREATE INDEX IF NOT EXISTS idx_cards_scheduled_date ON public.cards(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON public.review_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_user_id ON public.review_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON public.review_logs(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_decks_user_id ON public.decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_folder_id ON public.decks(folder_id);
CREATE INDEX IF NOT EXISTS idx_exams_user_id ON public.exams(user_id);
CREATE INDEX IF NOT EXISTS idx_exams_deck_id ON public.exams(deck_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON public.exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_turma_members_turma_id ON public.turma_members(turma_id);
CREATE INDEX IF NOT EXISTS idx_turma_members_user_id ON public.turma_members(user_id);
CREATE INDEX IF NOT EXISTS idx_turma_lessons_turma_id ON public.turma_lessons(turma_id);
CREATE INDEX IF NOT EXISTS idx_turma_lessons_subject_id ON public.turma_lessons(subject_id);
CREATE INDEX IF NOT EXISTS idx_turma_decks_turma_id ON public.turma_decks(turma_id);
CREATE INDEX IF NOT EXISTS idx_turma_decks_deck_id ON public.turma_decks(deck_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_id ON public.ai_token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_created_at ON public.ai_token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_user_missions_user_id ON public.user_missions(user_id);
CREATE INDEX IF NOT EXISTS idx_turmas_invite_code ON public.turmas(invite_code);

-- STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('card-images', 'card-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('community-covers', 'community-covers', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-files', 'lesson-files', true) ON CONFLICT DO NOTHING;
