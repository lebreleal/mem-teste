-- =============================================================
-- SECURITY HOTFIX: Fix verification_codes RLS & clean up
-- =============================================================

-- 1. Drop the overly permissive policy on verification_codes
DROP POLICY IF EXISTS "Service role full access verification" ON verification_codes;

-- 2. Create proper restrictive policies - NO public access at all
-- The table should only be accessible via service_role key in Edge Functions
-- This is already the case since we dropped the only policy
-- No new policies needed - access only via service_role

-- 3. Add rate limiting column for future use
ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;

-- 4. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_identifier_expires 
ON verification_codes (identifier, expires_at) 
WHERE used = false;

-- 5. Clean up old verification codes (older than 1 day)
DELETE FROM verification_codes WHERE expires_at < NOW() - INTERVAL '1 day';