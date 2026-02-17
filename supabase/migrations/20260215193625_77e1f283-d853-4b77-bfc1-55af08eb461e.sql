
-- Add subscription price to turmas
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS subscription_price numeric NOT NULL DEFAULT 0;
