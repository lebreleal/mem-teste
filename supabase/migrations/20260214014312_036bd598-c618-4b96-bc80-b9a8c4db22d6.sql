
-- =============================================
-- 1. TURMAS (Groups/Classes)
-- =============================================
CREATE TABLE public.turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  invite_code text UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.turma_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(turma_id, user_id)
);

ALTER TABLE public.turma_members ENABLE ROW LEVEL SECURITY;

-- Security definer function to check turma membership
CREATE OR REPLACE FUNCTION public.is_turma_member(_user_id uuid, _turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.turma_members
    WHERE user_id = _user_id AND turma_id = _turma_id
  )
$$;

-- Turmas policies
CREATE POLICY "Members can view their turmas"
  ON public.turmas FOR SELECT
  USING (public.is_turma_member(auth.uid(), id) OR owner_id = auth.uid());

CREATE POLICY "Authenticated users can create turmas"
  ON public.turmas FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update turmas"
  ON public.turmas FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete turmas"
  ON public.turmas FOR DELETE
  USING (auth.uid() = owner_id);

-- Turma members policies
CREATE POLICY "Members can view turma members"
  ON public.turma_members FOR SELECT
  USING (public.is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Users can join turmas"
  ON public.turma_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave turmas"
  ON public.turma_members FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 2. MARKETPLACE
-- =============================================
CREATE TABLE public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  price numeric(10,2) NOT NULL DEFAULT 0,
  is_free boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  card_count integer NOT NULL DEFAULT 0,
  downloads integer NOT NULL DEFAULT 0,
  avg_rating numeric(3,2) DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published listings"
  ON public.marketplace_listings FOR SELECT
  USING (is_published = true OR seller_id = auth.uid());

CREATE POLICY "Sellers can create listings"
  ON public.marketplace_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own listings"
  ON public.marketplace_listings FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own listings"
  ON public.marketplace_listings FOR DELETE
  USING (auth.uid() = seller_id);

-- Deck Reviews
CREATE TABLE public.deck_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

ALTER TABLE public.deck_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews"
  ON public.deck_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create reviews"
  ON public.deck_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
  ON public.deck_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
  ON public.deck_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- Marketplace purchases
CREATE TABLE public.marketplace_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_paid numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, buyer_id)
);

ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can view own purchases"
  ON public.marketplace_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "System can insert purchases"
  ON public.marketplace_purchases FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- =============================================
-- 3. MEMOGRANA (Wallet)
-- =============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_balance numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  description text NOT NULL DEFAULT '',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.wallet_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 4. CREATOR TIERS (computed from marketplace data)
-- =============================================
-- Tier is computed dynamically, but we cache it
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_tier integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tier_last_evaluated timestamptz;

-- Function to calculate marketplace fee based on tier
CREATE OR REPLACE FUNCTION public.get_marketplace_fee(tier integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN tier = 3 THEN 0.10
    WHEN tier = 2 THEN 0.15
    ELSE 0.20
  END;
$$;

-- Function to update listing avg rating
CREATE OR REPLACE FUNCTION public.update_listing_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketplace_listings
  SET avg_rating = (
    SELECT COALESCE(AVG(rating), 0)
    FROM public.deck_reviews
    WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id)
  ),
  rating_count = (
    SELECT COUNT(*)
    FROM public.deck_reviews
    WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id)
  )
  WHERE id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_listing_rating_on_review
  AFTER INSERT OR UPDATE OR DELETE ON public.deck_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_listing_rating();

-- Triggers for updated_at
CREATE TRIGGER update_turmas_updated_at
  BEFORE UPDATE ON public.turmas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
