
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_study_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS weekly_study_minutes jsonb DEFAULT NULL;

ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
