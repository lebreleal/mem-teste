
-- Create storage bucket for card images
INSERT INTO storage.buckets (id, name, public) VALUES ('card-images', 'card-images', true);

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload card images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-images');

-- Allow public read access
CREATE POLICY "Public can view card images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own card images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'card-images' AND (storage.foldername(name))[1] = auth.uid()::text);
