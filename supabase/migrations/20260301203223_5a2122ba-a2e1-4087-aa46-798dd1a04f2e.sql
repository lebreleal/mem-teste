
-- Mover pg_trgm para schema extensions (best practice)
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Recriar índice com schema correto
DROP INDEX IF EXISTS idx_tags_name_trgm;
CREATE INDEX idx_tags_name_trgm ON public.tags USING gin (name extensions.gin_trgm_ops);
