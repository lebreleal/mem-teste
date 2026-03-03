
-- Extensão para busca fuzzy (trigram) - ANTES dos índices
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

-- Tabela principal de tags
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  parent_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  is_official boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  merged_into_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  CONSTRAINT tags_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_tags_slug ON public.tags (slug);
CREATE INDEX idx_tags_name_trgm ON public.tags USING gin (name public.gin_trgm_ops);
CREATE INDEX idx_tags_usage_count ON public.tags (usage_count DESC);
CREATE INDEX idx_tags_parent_id ON public.tags (parent_id);

-- Deck <-> tags
CREATE TABLE public.deck_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  added_by uuid,
  CONSTRAINT deck_tags_unique UNIQUE (deck_id, tag_id)
);
CREATE INDEX idx_deck_tags_deck_id ON public.deck_tags (deck_id);
CREATE INDEX idx_deck_tags_tag_id ON public.deck_tags (tag_id);

-- Card <-> tags
CREATE TABLE public.card_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  added_by uuid,
  CONSTRAINT card_tags_unique UNIQUE (card_id, tag_id)
);
CREATE INDEX idx_card_tags_card_id ON public.card_tags (card_id);
CREATE INDEX idx_card_tags_tag_id ON public.card_tags (tag_id);

-- RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view tags"
  ON public.tags FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create tags"
  ON public.tags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update tags"
  ON public.tags FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tags"
  ON public.tags FOR DELETE USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone authenticated can view deck tags"
  ON public.deck_tags FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Deck owners can manage deck tags"
  ON public.deck_tags FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM decks WHERE id = deck_tags.deck_id AND user_id = auth.uid()
  ));
CREATE POLICY "Deck owners can delete deck tags"
  ON public.deck_tags FOR DELETE USING (EXISTS (
    SELECT 1 FROM decks WHERE id = deck_tags.deck_id AND user_id = auth.uid()
  ));

CREATE POLICY "Anyone authenticated can view card tags"
  ON public.card_tags FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Card owners can manage card tags"
  ON public.card_tags FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE c.id = card_tags.card_id AND d.user_id = auth.uid()
  ));
CREATE POLICY "Card owners can delete card tags"
  ON public.card_tags FOR DELETE USING (EXISTS (
    SELECT 1 FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE c.id = card_tags.card_id AND d.user_id = auth.uid()
  ));

-- Helper: gerar slug
CREATE OR REPLACE FUNCTION public.generate_tag_slug(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT lower(regexp_replace(regexp_replace(
    translate(p_name, 'áàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ', 'aaaaeeeiiioooouuucAAAAEEEIIIOOOOUUUC'),
    '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
$$;

-- Trigger: usage_count automático
CREATE OR REPLACE FUNCTION public.update_tag_usage_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.tag_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_deck_tags_usage
  AFTER INSERT OR DELETE ON public.deck_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_tag_usage_count();

CREATE TRIGGER trg_card_tags_usage
  AFTER INSERT OR DELETE ON public.card_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_tag_usage_count();

-- Trigger updated_at
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
