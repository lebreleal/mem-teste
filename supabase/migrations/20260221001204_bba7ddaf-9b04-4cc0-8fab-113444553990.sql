
-- Add selected_plan_id to profiles for persistence
ALTER TABLE public.profiles ADD COLUMN selected_plan_id uuid REFERENCES public.study_plans(id) ON DELETE SET NULL;
