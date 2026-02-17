
-- Create feature_comments table
CREATE TABLE public.feature_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_comments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view comments"
  ON public.feature_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create own comments"
  ON public.feature_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.feature_comments FOR DELETE
  USING (auth.uid() = user_id);
