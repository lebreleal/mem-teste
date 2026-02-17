
-- Feature requests table
CREATE TABLE public.feature_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'geral',
  status TEXT NOT NULL DEFAULT 'open',
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view all feature requests
CREATE POLICY "Authenticated users can view feature requests"
  ON public.feature_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can create their own feature requests
CREATE POLICY "Users can create feature requests"
  ON public.feature_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own feature requests
CREATE POLICY "Users can update own feature requests"
  ON public.feature_requests FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own feature requests
CREATE POLICY "Users can delete own feature requests"
  ON public.feature_requests FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Feature votes table (one vote per user per feature)
CREATE TABLE public.feature_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  feature_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_id)
);

ALTER TABLE public.feature_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view votes"
  ON public.feature_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own votes"
  ON public.feature_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON public.feature_votes FOR DELETE
  USING (auth.uid() = user_id);

-- Function to sync vote_count
CREATE OR REPLACE FUNCTION public.update_feature_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.feature_requests
  SET vote_count = (
    SELECT COUNT(*) FROM public.feature_votes
    WHERE feature_id = COALESCE(NEW.feature_id, OLD.feature_id)
  )
  WHERE id = COALESCE(NEW.feature_id, OLD.feature_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_vote_count_on_insert
  AFTER INSERT ON public.feature_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feature_vote_count();

CREATE TRIGGER update_vote_count_on_delete
  AFTER DELETE ON public.feature_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feature_vote_count();
