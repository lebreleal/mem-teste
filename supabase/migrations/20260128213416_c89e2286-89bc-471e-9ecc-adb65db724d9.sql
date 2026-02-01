-- Drop the existing restrictive policy for viewing profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a new policy that allows users to view their own profile OR admins to view all profiles
CREATE POLICY "Users can view their own profile or admins can view all" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.is_admin = true
  )
);

-- Also allow admins to update any profile (for document/email changes by admin)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile or admins can update all" 
ON public.profiles 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM profiles AS admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.is_admin = true
  )
);