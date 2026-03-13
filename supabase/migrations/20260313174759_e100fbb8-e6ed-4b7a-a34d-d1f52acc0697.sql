
-- Table to store user AI sources (text or file references) for 30 days
CREATE TABLE public.user_ai_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL DEFAULT 'text', -- 'text' | 'file'
  name text NOT NULL,
  text_content text, -- stored text when source_type = 'text'
  file_path text, -- storage path when source_type = 'file'
  file_size integer,
  mime_type text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_ai_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sources"
  ON public.user_ai_sources
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for quick lookups
CREATE INDEX idx_user_ai_sources_user_id ON public.user_ai_sources (user_id, created_at DESC);

-- Storage bucket for AI source files (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ai-sources', 'ai-sources', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can manage their own files
CREATE POLICY "Users can upload ai source files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ai-sources' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own ai source files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ai-sources' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own ai source files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ai-sources' AND (storage.foldername(name))[1] = auth.uid()::text);
