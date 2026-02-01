-- Fix RLS policies for gallery_images to be permissive
DROP POLICY IF EXISTS "Anyone can view active gallery images" ON public.gallery_images;
DROP POLICY IF EXISTS "Admins can manage gallery images" ON public.gallery_images;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Anyone can view active gallery images" 
ON public.gallery_images 
FOR SELECT 
TO public
USING (is_active = true);

CREATE POLICY "Admins can manage gallery images" 
ON public.gallery_images 
FOR ALL 
TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() AND profiles.is_admin = true
));