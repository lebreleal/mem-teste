
-- Add suggestion_type and suggested_tags to deck_suggestions
ALTER TABLE public.deck_suggestions
  ADD COLUMN IF NOT EXISTS suggestion_type text NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS suggested_tags jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tags_status text NOT NULL DEFAULT 'pending';

-- Suggestion votes (upvote/downvote)
CREATE TABLE IF NOT EXISTS public.suggestion_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id uuid NOT NULL REFERENCES public.deck_suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (1, -1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, user_id)
);

ALTER TABLE public.suggestion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view votes" ON public.suggestion_votes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own votes" ON public.suggestion_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes" ON public.suggestion_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes" ON public.suggestion_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Suggestion comments
CREATE TABLE IF NOT EXISTS public.suggestion_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id uuid NOT NULL REFERENCES public.deck_suggestions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suggestion_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view suggestion comments" ON public.suggestion_comments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own comments" ON public.suggestion_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.suggestion_comments
  FOR DELETE USING (auth.uid() = user_id);
