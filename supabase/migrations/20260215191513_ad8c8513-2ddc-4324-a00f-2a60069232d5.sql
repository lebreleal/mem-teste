
-- Add cover image URL to turmas
ALTER TABLE public.turmas ADD COLUMN IF NOT EXISTS cover_image_url text DEFAULT '';

-- Create storage bucket for community covers
INSERT INTO storage.buckets (id, name, public) VALUES ('community-covers', 'community-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view community cover images
CREATE POLICY "Anyone can view community covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'community-covers');

-- Allow turma owners to upload cover images
CREATE POLICY "Turma owners can upload covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'community-covers'
  AND auth.uid() IS NOT NULL
);

-- Allow turma owners to update covers
CREATE POLICY "Turma owners can update covers"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'community-covers'
  AND auth.uid() IS NOT NULL
);

-- Allow turma owners to delete covers
CREATE POLICY "Turma owners can delete covers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'community-covers'
  AND auth.uid() IS NOT NULL
);
