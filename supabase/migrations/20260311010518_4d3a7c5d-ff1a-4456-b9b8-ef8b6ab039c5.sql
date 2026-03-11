
-- Add share_slug to turmas for custom public links
ALTER TABLE turmas ADD COLUMN IF NOT EXISTS share_slug text UNIQUE;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_turmas_share_slug ON turmas(share_slug) WHERE share_slug IS NOT NULL;

-- Allow anyone (including anonymous) to read turmas by share_slug for public preview
CREATE POLICY "Anyone can view turmas by share_slug"
ON turmas FOR SELECT
TO anon, authenticated
USING (share_slug IS NOT NULL);
