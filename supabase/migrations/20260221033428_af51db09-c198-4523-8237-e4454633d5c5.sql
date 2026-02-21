
-- Add name column to study_plans
ALTER TABLE public.study_plans ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Meu Plano';

-- Drop the unique constraint on user_id to allow multiple plans per user
ALTER TABLE public.study_plans DROP CONSTRAINT IF EXISTS study_plans_user_id_key;

-- Drop the one-to-one FK relationship constraint (it was isOneToOne: true)
ALTER TABLE public.study_plans DROP CONSTRAINT IF EXISTS study_plans_user_id_fkey;

-- Re-add as a regular (non-unique) FK
ALTER TABLE public.study_plans ADD CONSTRAINT study_plans_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
