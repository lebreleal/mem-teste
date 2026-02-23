
-- 1. Create user_card_metadata table for personal notes
CREATE TABLE public.user_card_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  personal_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, card_id)
);

ALTER TABLE public.user_card_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metadata" ON public.user_card_metadata
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metadata" ON public.user_card_metadata
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metadata" ON public.user_card_metadata
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own metadata" ON public.user_card_metadata
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_card_metadata_updated_at
  BEFORE UPDATE ON public.user_card_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create function to auto-apply accepted suggestions
CREATE OR REPLACE FUNCTION public.apply_accepted_suggestion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_content jsonb;
  v_new_front text;
  v_new_back text;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    v_content := NEW.suggested_content;
    v_new_front := v_content->>'front_content';
    v_new_back := v_content->>'back_content';
    
    IF v_new_front IS NOT NULL OR v_new_back IS NOT NULL THEN
      UPDATE cards SET
        front_content = COALESCE(v_new_front, front_content),
        back_content = COALESCE(v_new_back, back_content),
        updated_at = now()
      WHERE id = NEW.card_id;
      
      -- Also update the parent deck's updated_at so subscribers detect changes
      UPDATE decks SET updated_at = now()
      WHERE id = (SELECT deck_id FROM cards WHERE id = NEW.card_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_apply_accepted_suggestion
  AFTER UPDATE ON public.deck_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_accepted_suggestion();
