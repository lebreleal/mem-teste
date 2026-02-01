/*
  # Sistema de Cotação de Produtos
  
  1. Novas Tabelas
    - `products` - Catálogo de produtos LED
    - `spare_parts` - Peças de reposição
    - `quotes` - Cotações/Orçamentos
    - `quote_spare_parts` - Peças de reposição da cotação
    - `admin_n8n_mappings` - Mapeamento de variáveis n8n
  
  2. Security
    - Enable RLS em todas as tabelas
    - Políticas para usuários autenticados
    - Políticas especiais para admins
*/

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  model text NOT NULL,
  category text NOT NULL CHECK (category IN ('PUBLICIDADE', 'RENTAL')),
  pitch text NOT NULL,
  photo_url text,
  price_usd numeric NOT NULL DEFAULT 0,
  chip_brand text,
  ic_model text,
  pcb_thickness text,
  nits text,
  differentials text,
  technology text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de peças de reposição
CREATE TABLE IF NOT EXISTS spare_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_usd numeric NOT NULL DEFAULT 0,
  editable_quantity boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tabela de cotações
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  width numeric NOT NULL,
  height numeric NOT NULL,
  delivery_cep text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  n8n_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de peças de reposição da cotação
CREATE TABLE IF NOT EXISTS quote_spare_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Tabela de mapeamento de variáveis n8n
CREATE TABLE IF NOT EXISTS admin_n8n_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  section text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_n8n_mappings ENABLE ROW LEVEL SECURITY;

-- Policies para products
CREATE POLICY "Todos podem ver produtos ativos"
  ON products FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Admins podem gerenciar produtos"
  ON products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policies para spare_parts
CREATE POLICY "Todos podem ver peças de reposição"
  ON spare_parts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar peças"
  ON spare_parts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policies para quotes
CREATE POLICY "Usuários podem ver suas próprias cotações"
  ON quotes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar cotações"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas cotações"
  ON quotes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins podem ver todas as cotações"
  ON quotes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Policies para quote_spare_parts
CREATE POLICY "Usuários podem ver peças de suas cotações"
  ON quote_spare_parts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.id = quote_spare_parts.quote_id
      AND quotes.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem inserir peças em suas cotações"
  ON quote_spare_parts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.id = quote_spare_parts.quote_id
      AND quotes.user_id = auth.uid()
    )
  );

-- Policies para admin_n8n_mappings
CREATE POLICY "Todos podem ver mapeamentos"
  ON admin_n8n_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar mapeamentos"
  ON admin_n8n_mappings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Inserir produtos de exemplo
INSERT INTO products (name, model, category, pitch, price_usd, chip_brand, ic_model, pcb_thickness, nits, differentials, technology, active) VALUES
('Painel LED P5 Outdoor', 'P5', 'PUBLICIDADE', 'P5', 300, 'Nationstar', 'ICN2038S', '1.6mm', '6500', 'Alta resolução, resistente a intempéries', 'SMD LED', true),
('Painel LED P8 Outdoor', 'P8', 'PUBLICIDADE', 'P8', 250, 'Kinglight', 'MBI5124', '1.6mm', '5500', 'Excelente custo-benefício', 'DIP LED', true),
('Painel LED P3.91 Indoor', 'P3.91', 'RENTAL', 'P3.91', 400, 'Nationstar', 'ICN2153', '1.2mm', '1000', 'Ultra fino, fácil montagem', 'SMD LED', true),
('Painel LED P4.81 Indoor', 'P4.81', 'RENTAL', 'P4.81', 350, 'Kinglight', 'ICN2038S', '1.2mm', '1200', 'Leve e portátil', 'SMD LED', true);

-- Inserir peças de reposição
INSERT INTO spare_parts (name, price_usd, editable_quantity) VALUES
('MRV 208', 50, true),
('G-Energy', 80, true),
('Módulo de Led', 45, true),
('Cabos', 10, false),
('Chave', 5, false),
('Parafusos', 2, false),
('Chapa de conexão', 15, false),
('Borracha vedação', 8, false),
('Cabo de energia 5v', 12, false),
('Cabo de dados', 10, false),
('LEDS', 20, false),
('IC', 25, false),
('Máscaras (REPOSIÇÃO)', 30, false);

-- Inserir mapeamentos n8n padrão
INSERT INTO admin_n8n_mappings (variable_name, display_name, description, section, order_index) VALUES
('TaxaCambialProducao', 'Taxa Cambial (Produção)', 'Taxa de câmbio na fase de produção', 'taxes', 1),
('TaxaCambialPreEmbarque', 'Taxa Cambial (Pré-Embarque)', 'Taxa de câmbio no pré-embarque', 'taxes', 2),
('TaxaCambialChegadaBrasil', 'Taxa Cambial (Chegada)', 'Taxa de câmbio na chegada ao Brasil', 'taxes', 3),
('CustosLedbrasIntermediacao', 'Intermediação Ledbras', 'Percentual de intermediação', 'costs_ledbras', 1),
('CustosLedbrasDocumentos', 'Documentos e Regularização', 'Custo de documentação', 'costs_ledbras', 2),
('Total1ValorMercadoria', 'Total da Mercadoria', 'Valor total da mercadoria em USD', 'totals', 1),
('Total2Despesas', 'Total de Despesas', 'Soma de todas as despesas', 'totals', 2),
('Total3ImpostosFederais', 'Total Impostos Federais', 'II + IPI + PIS + Cofins', 'totals', 3),
('Total4ImpostosEstaduais', 'Total ICMS', 'Imposto estadual a pagar', 'totals', 4),
('Total5Importacao', 'Total da Importação', 'Valor final da importação', 'totals', 5),
('Total6FluxoCaixa', 'Total Fluxo de Caixa', 'Total do fluxo de caixa', 'totals', 6);