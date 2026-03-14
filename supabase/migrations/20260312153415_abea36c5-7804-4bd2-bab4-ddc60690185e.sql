-- Concepts as editable entities with FSRS-6 scheduling
CREATE TABLE public.deck_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  state integer NOT NULL DEFAULT 0,
  stability double precision NOT NULL DEFAULT 0,
  difficulty double precision NOT NULL DEFAULT 0,
  scheduled_date timestamptz NOT NULL DEFAULT now(),
  learning_step integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deck_id, user_id, name)
);

-- Junction: which cards belong to which concept
CREATE TABLE public.concept_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.deck_concepts(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(concept_id, card_id)
);

-- RLS
ALTER TABLE public.deck_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own concepts" ON public.deck_concepts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own concept cards" ON public.concept_cards
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.deck_concepts dc
    WHERE dc.id = concept_cards.concept_id AND dc.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.deck_concepts dc
    WHERE dc.id = concept_cards.concept_id AND dc.user_id = auth.uid()
  ));

-- Indexes for fast lookups
CREATE INDEX idx_deck_concepts_deck_user ON public.deck_concepts(deck_id, user_id);
CREATE INDEX idx_concept_cards_concept ON public.concept_cards(concept_id);
CREATE INDEX idx_concept_cards_card ON public.concept_cards(card_id);