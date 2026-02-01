/*
  # Sistema Completo de Configuração de Variáveis N8N

  1. Nova Tabela - n8n_field_config
    - `id` (uuid, primary key)
    - `field_key` (text, unique) - identificador único do campo (ex: TaxaCambialProducao)
    - `field_label` (text) - label exibido ao usuário
    - `n8n_variable` (text) - variável que vem do N8N response
    - `section` (text) - seção do orçamento (stage1, stage2, stage3, costs_ledbras, etc)
    - `display_order` (integer) - ordem de exibição
    - `is_currency` (boolean) - se é valor monetário
    - `currency_type` (text) - USD ou BRL
    - `created_at` (timestamp)
    - `updated_at` (timestamp)

  2. Remover Tabelas Antigas
    - Drop field_mappings
    - Drop admin_n8n_mappings

  3. Popular com TODAS as variáveis do sistema
    - Produção (stage1)
    - Logística (stage2)
    - Taxas alfandegárias (stage3)
    - Impostos
    - Custos Ledbras
    - Totais

  4. Segurança
    - Enable RLS
    - Todos podem ler
    - Apenas admins podem editar
*/

DROP TABLE IF EXISTS field_mappings CASCADE;
DROP TABLE IF EXISTS admin_n8n_mappings CASCADE;

CREATE TABLE IF NOT EXISTS n8n_field_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text UNIQUE NOT NULL,
  field_label text NOT NULL,
  n8n_variable text NOT NULL,
  section text NOT NULL,
  display_order integer DEFAULT 0,
  is_currency boolean DEFAULT true,
  currency_type text DEFAULT 'BRL',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE n8n_field_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view n8n config"
  ON n8n_field_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage n8n config"
  ON n8n_field_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

INSERT INTO n8n_field_config (field_key, field_label, n8n_variable, section, display_order, is_currency, currency_type) VALUES
  ('TaxaCambialProducao', 'Taxa Cambial (Produção)', 'TaxaCambialProducao', 'stage1', 1, true, 'BRL'),
  ('ValorMercadoriaUSD', 'Valor da Mercadoria', 'ValorMercadoriaUSD', 'stage1', 2, true, 'USD'),
  ('ValorMercadoriaBRL', 'Valor da Mercadoria (BRL)', 'ValorMercadoriaBRL', 'stage1', 3, true, 'BRL'),
  ('TaxaProcessamentoCambial', 'Taxa de Processamento Cambial', 'TaxaProcessamentoCambial', 'stage1', 4, true, 'BRL'),
  ('IOF', 'IOF (3,5%)', 'IOF', 'stage1', 5, true, 'BRL'),
  ('CustoUnitarioProdutoBRL', 'Custo Unitário Produto', 'CustoUnitarioProdutoBRL', 'stage1', 6, true, 'BRL'),
  ('CustoTotalProdutoBRL', 'Custo Total Produto', 'CustoTotalProdutoBRL', 'stage1', 7, true, 'BRL'),
  
  ('CustosLogisticosUSD', 'Custos Logísticos', 'CustosLogisticosUSD', 'stage2', 1, true, 'USD'),
  ('CustosLogisticosBRL', 'Custos Logísticos (BRL)', 'CustosLogisticosBRL', 'stage2', 2, true, 'BRL'),
  ('ArmazenagemChinaUSD', 'Armazenagem na China', 'ArmazenagemChinaUSD', 'stage2', 3, true, 'USD'),
  ('ArmazenagemChinaBRL', 'Armazenagem na China (BRL)', 'ArmazenagemChinaBRL', 'stage2', 4, true, 'BRL'),
  ('SeguroUSD', 'Seguro', 'SeguroUSD', 'stage2', 5, true, 'USD'),
  ('SeguroBRL', 'Seguro (BRL)', 'SeguroBRL', 'stage2', 6, true, 'BRL'),
  ('FreteRodoviarioUSD', 'Frete Rodoviário', 'FreteRodoviarioUSD', 'stage2', 7, true, 'USD'),
  ('FreteRodoviarioBRL', 'Frete Rodoviário (BRL)', 'FreteRodoviarioBRL', 'stage2', 8, true, 'BRL'),
  ('TarifaExcedentePesoUSD', 'Tarifa Excedente de Peso', 'TarifaExcedentePesoUSD', 'stage2', 9, true, 'USD'),
  ('TarifaExcedentePesoBRL', 'Tarifa Excedente de Peso (BRL)', 'TarifaExcedentePesoBRL', 'stage2', 10, true, 'BRL'),
  
  ('TaxaSiscomex', 'Taxa de uso do Siscomex', 'TaxaSiscomex', 'stage3', 1, true, 'BRL'),
  ('AFRMM', 'Marinha Mercante (AFRMM)', 'AFRMM', 'stage3', 2, true, 'BRL'),
  
  ('II', 'II - Imposto Importação', 'II', 'taxes', 1, true, 'BRL'),
  ('IPI', 'IPI - Produto Industrializado', 'IPI', 'taxes', 2, true, 'BRL'),
  ('PIS', 'PIS - Prog. Integração Social', 'PIS', 'taxes', 3, true, 'BRL'),
  ('Cofins', 'Cofins - Contrib. Financ.', 'Cofins', 'taxes', 4, true, 'BRL'),
  ('ICMS', 'ICMS a pagar', 'ICMS', 'taxes', 5, true, 'BRL'),
  
  ('CustosLedbrasIntermediacao', 'Custos Ledbras Intermediação', 'CustosLedbrasIntermediacao', 'ledbras', 1, true, 'BRL'),
  ('CustosLedbrasDocumentos', 'Custos Ledbras Documentos', 'CustosLedbrasDocumentos', 'ledbras', 2, true, 'BRL'),
  ('TotalCustosLedbras', 'Total Custos Ledbras', 'TotalCustosLedbras', 'ledbras', 3, true, 'BRL'),
  
  ('TotalCustosImportacao', 'Total de Custos de Importação', 'TotalCustosImportacao', 'totals', 1, true, 'BRL'),
  ('CustoUnitarioPainelLED', 'Custo Unitário do Painel LED', 'CustoUnitarioPainelLED', 'totals', 2, true, 'BRL'),
  ('TotalImpostos', 'Total de Impostos', 'TotalImpostos', 'totals', 3, true, 'BRL')
ON CONFLICT (field_key) DO UPDATE SET
  field_label = EXCLUDED.field_label,
  n8n_variable = EXCLUDED.n8n_variable,
  section = EXCLUDED.section,
  display_order = EXCLUDED.display_order,
  is_currency = EXCLUDED.is_currency,
  currency_type = EXCLUDED.currency_type,
  updated_at = now();
