
-- Create subscription history table
CREATE TABLE public.turma_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.turma_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can view turma subscriptions"
ON public.turma_subscriptions
FOR SELECT
USING (
  is_turma_member(auth.uid(), turma_id)
);

CREATE POLICY "Users can insert own subscriptions"
ON public.turma_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admin of turma can view all subscriptions (already covered by member policy)
