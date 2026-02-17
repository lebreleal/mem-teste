
-- Add is_private flag to turmas (public by default)
ALTER TABLE public.turmas ADD COLUMN is_private boolean NOT NULL DEFAULT false;

-- Allow authenticated users to view public turmas for discovery
CREATE POLICY "Anyone can view public turmas"
ON public.turmas
FOR SELECT
USING (is_private = false AND auth.uid() IS NOT NULL);
