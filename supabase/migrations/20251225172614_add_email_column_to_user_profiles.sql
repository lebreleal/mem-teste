/*
  # Add email column to user_profiles
  
  1. Changes
    - Add `email` column to `user_profiles` table
    - Make email column unique to prevent duplicates
    - Add index for better query performance
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN email text UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
  END IF;
END $$;