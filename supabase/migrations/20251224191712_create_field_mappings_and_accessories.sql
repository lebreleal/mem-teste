/*
  # Criar mapeamento de campos e acessórios

  1. Nova Tabela - field_mappings
    - `id` (uuid, primary key)
    - `field_key` (text, unique) - chave do campo (ex: "ValorMercadoriaUSD")
    - `n8n_variable` (text) - variável do n8n_response
    - `field_label` (text) - label exibido na tela
    - `section` (text) - seção onde aparece
    - `created_at` (timestamp)
    - `updated_at` (timestamp)
  
  2. Nova Tabela - quote_accessories
    - `id` (uuid, primary key)
    - `quote_id` (uuid, foreign key para quotes)
    - `name` (text) - nome do acessório
    - `quantity` (integer) - quantidade
    - `unit_price_usd` (numeric) - preço unitário em USD
    - `photo_url` (text) - URL da foto
    - `created_at` (timestamp)
  
  3. Segurança
    - Enable RLS em ambas tabelas
    - Apenas admins podem gerenciar field_mappings
    - Usuários podem ver seus próprios acessórios
    - Apenas admins podem editar acessórios
*/

CREATE TABLE IF NOT EXISTS field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text UNIQUE NOT NULL,
  n8n_variable text NOT NULL,
  field_label text NOT NULL,
  section text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_usd numeric(10,2) NOT NULL DEFAULT 0,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_accessories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read field mappings"
  ON field_mappings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can manage field mappings"
  ON field_mappings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can view their quote accessories"
  ON quote_accessories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes
      WHERE quotes.id = quote_accessories.quote_id
      AND quotes.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all quote accessories"
  ON quote_accessories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can manage quote accessories"
  ON quote_accessories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

INSERT INTO field_mappings (field_key, n8n_variable, field_label, section)
VALUES 
  ('ValorMercadoriaUSD', 'ValorMercadoriaUSD', 'Valor da Mercadoria (USD)', 'resumo'),
  ('ValorMercadoriaBRL', 'ValorMercadoriaBRL', 'Valor da Mercadoria (BRL)', 'resumo'),
  ('TaxaCambialProducao', 'TaxaCambialProducao', 'Taxa Cambial Producao', 'stage1'),
  ('TaxaProcessamentoCambial', 'TaxaProcessamentoCambial', 'Taxa Processamento Cambial', 'stage1'),
  ('IOF', 'IOF', 'IOF (3,5%)', 'stage1'),
  ('TotalProducao', 'TotalProducao', 'Total da Producao', 'stage1'),
  ('CustosLogisticosUSD', 'CustosLogisticosUSD', 'Custos Logisticos (USD)', 'stage2'),
  ('CustosLogisticosBRL', 'CustosLogisticosBRL', 'Custos Logisticos (BRL)', 'stage2'),
  ('TotalDespesasEmbarque', 'TotalDespesasEmbarque', 'Total Despesas Embarque', 'stage2'),
  ('Total3ImpostosFederais', 'Total3ImpostosFederais', 'Total Impostos Federais', 'stage3'),
  ('Total4ImpostosEstaduais', 'Total4ImpostosEstaduais', 'Total Impostos Estaduais', 'stage3'),
  ('TotalDespesasBrasil', 'TotalDespesasBrasil', 'Total Despesas Brasil', 'stage3'),
  ('Total5Importacao', 'Total5Importacao', 'Total da Importacao', 'total'),
  ('CustoUnitarioProdutoBRL', 'CustoUnitarioProdutoBRL', 'Custo Unitario Produto (BRL)', 'custo_unitario'),
  ('CustoTotalProdutoBRL', 'CustoTotalProdutoBRL', 'Custo Total Produto (BRL)', 'custo_unitario')
ON CONFLICT (field_key) DO NOTHING;
