-- Add weekly_minutes JSONB column to study_plans
-- Format: {"mon": 60, "tue": 30, "wed": 60, "thu": 60, "fri": 60, "sat": 30, "sun": 0}
-- When null, uses daily_minutes for all days (backward compatible)
ALTER TABLE public.study_plans
ADD COLUMN weekly_minutes jsonb DEFAULT NULL;