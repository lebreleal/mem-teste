
-- =============================================
-- 1. TURMAS: adicionar campos novos
-- =============================================
ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS subscription_price_yearly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';

-- =============================================
-- 2. DECKS: adicionar FK para comunidade e flags
-- =============================================
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.turmas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_live_deck boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_free_in_community boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_decks_community_id ON public.decks(community_id);

-- =============================================
-- 3. TURMA_SUBSCRIPTIONS: adicionar status e plan_type
-- =============================================
ALTER TABLE public.turma_subscriptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'monthly';

-- Renomear para semântica mais clara (expires_at -> end_date alias via view ou uso direto)
-- Manter expires_at para não quebrar código existente, mas adicionar constraint
ALTER TABLE public.turma_subscriptions
  ADD CONSTRAINT chk_subscription_status CHECK (status IN ('active', 'canceled', 'expired'));

ALTER TABLE public.turma_subscriptions
  ADD CONSTRAINT chk_subscription_plan_type CHECK (plan_type IN ('monthly', 'yearly'));

-- =============================================
-- 4. DECK_SUGGESTIONS: nova tabela
-- =============================================
CREATE TABLE IF NOT EXISTS public.deck_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  suggested_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  moderator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_suggestion_status CHECK (status IN ('pending', 'accepted', 'rejected'))
);

ALTER TABLE public.deck_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS: Quem sugeriu pode ver suas sugestões
CREATE POLICY "Users can view own suggestions"
  ON public.deck_suggestions FOR SELECT
  USING (auth.uid() = suggester_user_id);

-- RLS: Dono da comunidade/deck pode ver todas as sugestões dos decks dele
CREATE POLICY "Deck owners can view suggestions"
  ON public.deck_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_suggestions.deck_id
      AND d.user_id = auth.uid()
    )
  );

-- RLS: Membros de comunidade podem ver sugestões de decks da comunidade
CREATE POLICY "Community members can view deck suggestions"
  ON public.deck_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_suggestions.deck_id
      AND d.community_id IS NOT NULL
      AND public.is_turma_member(auth.uid(), d.community_id)
    )
  );

-- RLS: Usuários autenticados podem criar sugestões
CREATE POLICY "Authenticated users can create suggestions"
  ON public.deck_suggestions FOR INSERT
  WITH CHECK (auth.uid() = suggester_user_id);

-- RLS: Dono do deck pode atualizar status (aceitar/rejeitar)
CREATE POLICY "Deck owners can update suggestions"
  ON public.deck_suggestions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_suggestions.deck_id
      AND d.user_id = auth.uid()
    )
  );

-- RLS: Quem sugeriu pode deletar sugestões pendentes
CREATE POLICY "Suggesters can delete pending suggestions"
  ON public.deck_suggestions FOR DELETE
  USING (auth.uid() = suggester_user_id AND status = 'pending');

CREATE INDEX IF NOT EXISTS idx_deck_suggestions_deck_id ON public.deck_suggestions(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_suggestions_suggester ON public.deck_suggestions(suggester_user_id);

-- =============================================
-- 5. COMMUNITY_REVENUE_LOGS: revenue share tracking
-- =============================================
CREATE TABLE IF NOT EXISTS public.community_revenue_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.turma_subscriptions(id) ON DELETE SET NULL,
  subscriber_user_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  platform_fee_pct numeric NOT NULL DEFAULT 0.30,
  platform_amount numeric NOT NULL DEFAULT 0,
  owner_amount numeric NOT NULL DEFAULT 0,
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_revenue_status CHECK (status IN ('pending', 'paid', 'failed', 'refunded'))
);

ALTER TABLE public.community_revenue_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Dono da comunidade pode ver seus logs de receita
CREATE POLICY "Community owners can view revenue logs"
  ON public.community_revenue_logs FOR SELECT
  USING (auth.uid() = owner_user_id);

-- RLS: Assinante pode ver seus próprios registros de pagamento
CREATE POLICY "Subscribers can view own payment logs"
  ON public.community_revenue_logs FOR SELECT
  USING (auth.uid() = subscriber_user_id);

-- RLS: Admins podem ver tudo
CREATE POLICY "Admins can view all revenue logs"
  ON public.community_revenue_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_revenue_community ON public.community_revenue_logs(community_id);
CREATE INDEX IF NOT EXISTS idx_revenue_owner ON public.community_revenue_logs(owner_user_id);

-- Trigger para updated_at no deck_suggestions
CREATE TRIGGER update_deck_suggestions_updated_at
  BEFORE UPDATE ON public.deck_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
