
-- Fix 1: Restrict profiles SELECT to own data only
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create a safe public view with only non-sensitive fields
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, name, creator_tier
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;

-- Fix 2: Server-side marketplace purchase RPC
CREATE OR REPLACE FUNCTION public.process_marketplace_purchase(
  p_listing_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id UUID;
  v_listing RECORD;
  v_buyer_balance NUMERIC;
  v_seller_balance NUMERIC;
  v_seller_tier INTEGER;
  v_fee NUMERIC;
  v_seller_amount NUMERIC;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock listing for update
  SELECT * INTO v_listing
  FROM marketplace_listings
  WHERE id = p_listing_id AND is_published = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Check for existing purchase
  IF EXISTS (
    SELECT 1 FROM marketplace_purchases
    WHERE listing_id = p_listing_id AND buyer_id = v_buyer_id
  ) THEN
    RAISE EXCEPTION 'Already purchased';
  END IF;

  IF NOT v_listing.is_free THEN
    -- Lock buyer profile
    SELECT memocoins INTO v_buyer_balance
    FROM profiles
    WHERE id = v_buyer_id
    FOR UPDATE;

    IF v_buyer_balance < v_listing.price THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Debit buyer
    UPDATE profiles
    SET memocoins = memocoins - v_listing.price
    WHERE id = v_buyer_id;

    -- Record buyer transaction
    INSERT INTO memocoin_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_buyer_id, -v_listing.price, 'debit', 'Compra: ' || v_listing.title, p_listing_id);

    -- Lock seller profile and get tier
    SELECT memocoins, creator_tier INTO v_seller_balance, v_seller_tier
    FROM profiles
    WHERE id = v_listing.seller_id
    FOR UPDATE;

    v_fee := CASE
      WHEN v_seller_tier = 3 THEN 0.10
      WHEN v_seller_tier = 2 THEN 0.15
      ELSE 0.20
    END;
    v_seller_amount := v_listing.price * (1 - v_fee);

    -- Credit seller
    UPDATE profiles
    SET memocoins = memocoins + v_seller_amount
    WHERE id = v_listing.seller_id;

    -- Record seller transaction
    INSERT INTO memocoin_transactions (user_id, amount, type, description, reference_id)
    VALUES (v_listing.seller_id, v_seller_amount, 'credit',
      format('Venda: %s (taxa %s%%)', v_listing.title, (v_fee * 100)::INTEGER), p_listing_id);
  END IF;

  -- Record purchase
  INSERT INTO marketplace_purchases (listing_id, buyer_id, price_paid)
  VALUES (p_listing_id, v_buyer_id, CASE WHEN v_listing.is_free THEN 0 ELSE v_listing.price END);

  -- Increment downloads
  UPDATE marketplace_listings
  SET downloads = downloads + 1
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true, 'deck_id', v_listing.deck_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_marketplace_purchase TO authenticated;
