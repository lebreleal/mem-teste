
-- Community ratings table
CREATE TABLE public.turma_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(turma_id, user_id)
);

ALTER TABLE public.turma_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view ratings"
ON public.turma_ratings FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Members can create ratings"
ON public.turma_ratings FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_turma_member(auth.uid(), turma_id));

CREATE POLICY "Users can update own ratings"
ON public.turma_ratings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ratings"
ON public.turma_ratings FOR DELETE
USING (auth.uid() = user_id);

-- Add avg_rating and rating_count to turmas
ALTER TABLE public.turmas ADD COLUMN avg_rating numeric DEFAULT 0;
ALTER TABLE public.turmas ADD COLUMN rating_count integer NOT NULL DEFAULT 0;

-- Trigger to update turma rating stats
CREATE OR REPLACE FUNCTION public.update_turma_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.turmas
  SET avg_rating = (
    SELECT COALESCE(AVG(rating), 0)
    FROM public.turma_ratings
    WHERE turma_id = COALESCE(NEW.turma_id, OLD.turma_id)
  ),
  rating_count = (
    SELECT COUNT(*)
    FROM public.turma_ratings
    WHERE turma_id = COALESCE(NEW.turma_id, OLD.turma_id)
  )
  WHERE id = COALESCE(NEW.turma_id, OLD.turma_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_turma_rating_on_change
AFTER INSERT OR UPDATE OR DELETE ON public.turma_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_turma_rating();
