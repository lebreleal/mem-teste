-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enum for knowledge categories
CREATE TYPE public.knowledge_category AS ENUM ('produtos', 'objecoes', 'faq', 'scripts');

-- Create enum for suggestion types
CREATE TYPE public.suggestion_type AS ENUM ('nova_resposta', 'gap_conhecimento', 'padrao_sucesso', 'objecao_frequente');

-- Create enum for suggestion status
CREATE TYPE public.suggestion_status AS ENUM ('pendente', 'aprovada', 'descartada');

-- Create enum for message sender
CREATE TYPE public.message_sender AS ENUM ('user', 'bot', 'human');

-- Create conhecimento_base table (knowledge base with embeddings)
CREATE TABLE public.conhecimento_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    categoria knowledge_category NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create clientes table (customers with conversation state)
CREATE TABLE public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone TEXT UNIQUE NOT NULL,
    nome TEXT,
    email TEXT,
    client_state JSONB DEFAULT '{}',
    lead_score INTEGER DEFAULT 10,
    stage TEXT DEFAULT 'greeting',
    memoria_longo_prazo JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create conversas table (conversations history)
CREATE TABLE public.conversas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
    remetente message_sender NOT NULL,
    texto TEXT NOT NULL,
    agente_usado TEXT,
    confianca_resposta NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sugestoes_melhoria table (AI-generated improvement suggestions)
CREATE TABLE public.sugestoes_melhoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo suggestion_type NOT NULL,
    descricao TEXT NOT NULL,
    sugestao_texto TEXT NOT NULL,
    fonte_conversa_id UUID REFERENCES public.conversas(id) ON DELETE SET NULL,
    status suggestion_status DEFAULT 'pendente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create agente_configs table (agent configurations)
CREATE TABLE public.agente_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT UNIQUE NOT NULL,
    prompt_sistema TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    temperatura NUMERIC DEFAULT 0.7,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create metricas table (daily metrics)
CREATE TABLE public.metricas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data DATE UNIQUE NOT NULL,
    total_conversas INTEGER DEFAULT 0,
    leads_qualificados INTEGER DEFAULT 0,
    orcamentos_enviados INTEGER DEFAULT 0,
    reunioes_agendadas INTEGER DEFAULT 0,
    transferencias_humano INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.conhecimento_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sugestoes_melhoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conhecimento_base
CREATE POLICY "Admins can manage knowledge base"
ON public.conhecimento_base FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read knowledge base"
ON public.conhecimento_base FOR SELECT
USING (true);

-- RLS Policies for clientes
CREATE POLICY "Admins can manage clients"
ON public.clientes FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- RLS Policies for conversas
CREATE POLICY "Admins can manage conversations"
ON public.conversas FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- RLS Policies for sugestoes_melhoria
CREATE POLICY "Admins can manage suggestions"
ON public.sugestoes_melhoria FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- RLS Policies for agente_configs
CREATE POLICY "Admins can manage agent configs"
ON public.agente_configs FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read active agent configs"
ON public.agente_configs FOR SELECT
USING (ativo = true);

-- RLS Policies for metricas
CREATE POLICY "Admins can manage metrics"
ON public.metricas FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read metrics"
ON public.metricas FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Create function to match documents using vector similarity
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

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conhecimento_base_updated_at
BEFORE UPDATE ON public.conhecimento_base
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agente_configs_updated_at
BEFORE UPDATE ON public.agente_configs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();