-- Fix function search path for match_documents
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(1536),
    match_count INT DEFAULT 5,
    filter_category knowledge_category DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    titulo TEXT,
    conteudo TEXT,
    categoria knowledge_category,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.id,
        kb.titulo,
        kb.conteudo,
        kb.categoria,
        1 - (kb.embedding <=> query_embedding) AS similarity
    FROM public.conhecimento_base kb
    WHERE 
        kb.embedding IS NOT NULL
        AND (filter_category IS NULL OR kb.categoria = filter_category)
    ORDER BY kb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Fix function search path for update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;