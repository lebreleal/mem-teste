/*
  # Fix user_profiles RLS policies

  1. Changes
    - Drop all existing permissive policies
    - Create proper restrictive policies for authenticated users
    - Allow users to read and update only their own profile
    - Allow authenticated users to insert their own profile on signup
  
  2. Security
    - Users can only access their own data
    - Insert requires authenticated user and matching ID
*/

DROP POLICY IF EXISTS "Service role full access" ON user_profiles;
DROP POLICY IF EXISTS "Anon can select by whatsapp" ON user_profiles;
DROP POLICY IF EXISTS "Anon can insert" ON user_profiles;
DROP POLICY IF EXISTS "Anon can update" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
