/*
  # Adicionar CPF/CNPJ e Sistema de Itens Inclusos

  1. Alterações em user_profiles
    - Adicionar `cpf_cnpj` (text) - CPF ou CNPJ do usuário
  
  2. Nova Tabela - included_items
    - `id` (uuid, primary key)
    - `name` (text) - nome do item
    - `photo_url` (text) - URL da foto
    - `is_fixed_quantity` (boolean) - se quantidade é fixa ou calculada
    - `fixed_quantity` (integer) - quantidade fixa (se aplicável)
    - `calculation_variable` (text) - variável para cálculo (ex: "total_cabinets")
    - `calculation_divisor` (numeric) - divisor na fórmula
    - `calculation_round` (text) - tipo de arredondamento: "up" ou "down"
    - `is_editable` (boolean) - se usuário pode editar quantidade
    - `display_order` (integer) - ordem de exibição
    - `created_at` (timestamp)
  
  3. Atualizar field_mappings
    - Adicionar todas as variáveis do sistema
  
  4. Segurança
    - Enable RLS em included_items
    - Todos podem ver included_items
    - Apenas admins podem gerenciar
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'cpf_cnpj'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN cpf_cnpj text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS included_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  photo_url text,
  is_fixed_quantity boolean DEFAULT false,
  fixed_quantity integer DEFAULT 1,
  calculation_variable text DEFAULT 'total_cabinets',
  calculation_divisor numeric(10,2) DEFAULT 1,
  calculation_round text DEFAULT 'up',
  is_editable boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE included_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view included items"
  ON included_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage included items"
  ON included_items
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
  ('ArmazenagemChinaUSD', 'ArmazenagemChinaUSD', 'Armazenagem China (USD)', 'stage2'),
  ('ArmazenagemChinaBRL', 'ArmazenagemChinaBRL', 'Armazenagem China (BRL)', 'stage2'),
  ('SeguroUSD', 'SeguroUSD', 'Seguro (USD)', 'stage2'),
  ('SeguroBRL', 'SeguroBRL', 'Seguro (BRL)', 'stage2'),
  ('FreteRodoviarioUSD', 'FreteRodoviarioUSD', 'Frete Rodoviario (USD)', 'stage2'),
  ('FreteRodoviarioBRL', 'FreteRodoviarioBRL', 'Frete Rodoviario (BRL)', 'stage2'),
  ('TarifaExcedentePesoUSD', 'TarifaExcedentePesoUSD', 'Tarifa Excedente Peso (USD)', 'stage2'),
  ('TarifaExcedentePesoBRL', 'TarifaExcedentePesoBRL', 'Tarifa Excedente Peso (BRL)', 'stage2'),
  ('TaxaSiscomex', 'TaxaSiscomex', 'Taxa Siscomex', 'stage3'),
  ('AFRMM', 'AFRMM', 'AFRMM', 'stage3'),
  ('II', 'II', 'II - Imposto Importacao', 'stage3'),
  ('IPI', 'IPI', 'IPI - Produto Industrializado', 'stage3'),
  ('PIS', 'PIS', 'PIS', 'stage3'),
  ('Cofins', 'Cofins', 'Cofins', 'stage3'),
  ('ICMS', 'ICMS', 'ICMS', 'stage3'),
  ('CustosLedbrasIntermediacao', 'CustosLedbrasIntermediacao', 'Custos Ledbras Intermediacao', 'ledbras'),
  ('CustosLedbrasDocumentos', 'CustosLedbrasDocumentos', 'Custos Ledbras Documentos', 'ledbras'),
  ('TotalCustosLedbras', 'TotalCustosLedbras', 'Total Custos Ledbras', 'ledbras')
ON CONFLICT (field_key) DO UPDATE SET
  n8n_variable = EXCLUDED.n8n_variable,
  field_label = EXCLUDED.field_label,
  section = EXCLUDED.section,
  updated_at = now();
