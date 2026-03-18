
-- Fix search_path warnings on trigger functions
CREATE OR REPLACE FUNCTION public.cards_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', coalesce(public.strip_html(NEW.front_content), '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(public.strip_html(NEW.back_content), '')), 'B');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decks_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('portuguese', coalesce(NEW.name, ''));
  RETURN NEW;
END;
$$;
