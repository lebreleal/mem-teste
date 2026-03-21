CREATE TABLE public.card_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, card_id)
);

ALTER TABLE public.card_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks" ON public.card_bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookmarks" ON public.card_bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookmarks" ON public.card_bookmarks FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_card_bookmarks_user ON public.card_bookmarks(user_id);
CREATE INDEX idx_card_bookmarks_card ON public.card_bookmarks(card_id);