ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS imported_source_deck_id uuid,
  ADD COLUMN IF NOT EXISTS imported_owner_name text;

CREATE TABLE IF NOT EXISTS public.deck_access_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  owner_name text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  redeemed_by uuid,
  redeemed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_access_codes TO authenticated;
GRANT ALL ON public.deck_access_codes TO service_role;

ALTER TABLE public.deck_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage access codes"
  ON public.deck_access_codes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_deck_access_codes_deck ON public.deck_access_codes(deck_id);

CREATE OR REPLACE FUNCTION public.admin_create_deck_access_codes(
  p_deck_id uuid,
  p_count integer DEFAULT 1,
  p_note text DEFAULT ''
)
RETURNS SETOF public.deck_access_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_owner_name text;
  v_code text;
  i integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 100 THEN
    RAISE EXCEPTION 'invalid_count';
  END IF;

  SELECT d.user_id INTO v_owner FROM public.decks d WHERE d.id = p_deck_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'deck_not_found';
  END IF;
  SELECT p.name INTO v_owner_name FROM public.profiles p WHERE p.id = v_owner;

  FOR i IN 1..p_count LOOP
    LOOP
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.deck_access_codes c WHERE c.code = v_code);
    END LOOP;

    RETURN QUERY
    INSERT INTO public.deck_access_codes (code, deck_id, owner_id, owner_name, note, created_by)
    VALUES (v_code, p_deck_id, v_owner, coalesce(v_owner_name, ''), coalesce(p_note, ''), auth.uid())
    RETURNING *;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_deck_access_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.deck_access_codes%ROWTYPE;
  v_uid uuid := auth.uid();
  v_new_deck_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row FROM public.deck_access_codes
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;
  IF v_row.redeemed_by IS NOT NULL THEN
    RAISE EXCEPTION 'code_already_used';
  END IF;
  IF v_row.owner_id = v_uid THEN
    RAISE EXCEPTION 'own_deck';
  END IF;

  SELECT d.name INTO v_name FROM public.decks d WHERE d.id = v_row.deck_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'deck_not_found';
  END IF;

  INSERT INTO public.decks (user_id, name, imported_source_deck_id, imported_owner_name)
  VALUES (v_uid, v_name, v_row.deck_id, v_row.owner_name)
  RETURNING id INTO v_new_deck_id;

  INSERT INTO public.cards (deck_id, front_content, back_content, card_type)
  SELECT v_new_deck_id, c.front_content, c.back_content, coalesce(c.card_type, 'basic')
  FROM public.cards c
  WHERE c.deck_id = v_row.deck_id;

  UPDATE public.deck_access_codes
  SET redeemed_by = v_uid, redeemed_at = now()
  WHERE id = v_row.id;

  RETURN v_new_deck_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_deck_access_codes(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_deck_access_code(text) TO authenticated;