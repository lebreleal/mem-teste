-- First, create a security definer function to check admin status (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND is_admin = true
  )
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Users can view their own profile or admins can view all" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile or admins can update all" ON public.profiles;

-- Recreate policies using the security definer function
CREATE POLICY "Users can view their own profile or admins can view all" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR 
  public.is_admin(auth.uid())
);

CREATE POLICY "Users can update their own profile or admins can update all" 
ON public.profiles 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR 
  public.is_admin(auth.uid())
);

-- Also fix gallery_images RLS policies that might have similar issues
DROP POLICY IF EXISTS "Admins can manage gallery images" ON public.gallery_images;
DROP POLICY IF EXISTS "Anyone can view active gallery images" ON public.gallery_images;

CREATE POLICY "Anyone can view active gallery images" 
ON public.gallery_images 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage gallery images" 
ON public.gallery_images 
FOR ALL
USING (public.is_admin(auth.uid()));

-- Fix products RLS policies
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;

CREATE POLICY "Anyone can view active products" 
ON public.products 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage products" 
ON public.products 
FOR ALL
USING (public.is_admin(auth.uid()));

-- Fix quote_questions RLS policies
DROP POLICY IF EXISTS "Admins can manage questions" ON public.quote_questions;
DROP POLICY IF EXISTS "Anyone can view active questions" ON public.quote_questions;

CREATE POLICY "Anyone can view active questions" 
ON public.quote_questions 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage questions" 
ON public.quote_questions 
FOR ALL
USING (public.is_admin(auth.uid()));

-- Fix quotes RLS policies
DROP POLICY IF EXISTS "Admins can view all quotes" ON public.quotes;
DROP POLICY IF EXISTS "Admins can update all quotes" ON public.quotes;

CREATE POLICY "Admins can view all quotes" 
ON public.quotes 
FOR SELECT 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all quotes" 
ON public.quotes 
FOR UPDATE 
USING (public.is_admin(auth.uid()));

-- Fix site_settings RLS policies
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;

CREATE POLICY "Admins can manage site settings" 
ON public.site_settings 
FOR ALL
USING (public.is_admin(auth.uid()));