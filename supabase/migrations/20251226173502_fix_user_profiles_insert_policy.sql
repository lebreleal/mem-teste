/*
  # Fix user_profiles INSERT policy for signup flow

  1. Changes
    - Drop existing insert policy that may block signup
    - Create new policy that allows authenticated users to insert their own profile
    - The check ensures the inserted id matches the authenticated user's id
*/

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
