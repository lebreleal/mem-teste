/*
  # Reestruturar tabela orders para 3 etapas principais
  
  1. Mudanças
    - Remove todas as colunas antigas de stages individuais
    - Adiciona stage_1_data, stage_2_data, stage_3_data como JSONB
    - Adiciona detailed_costs como JSONB para custos detalhados
    - Adiciona costs_visible para controlar quando cliente vê valores
  
  2. Estrutura JSON
    - stage_1_data: orçamento, contrato, pagamento, logo, produção
    - stage_2_data: custos embarque, pagamento embarque, rastreamento
    - stage_3_data: documentação, impostos, desembaraço, entrega
    - detailed_costs: importação, IOF, dólar, etc.
*/

-- Remove colunas antigas se existirem
DO $$ 
BEGIN
  -- Remove colunas de stage_1
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stage_1_status') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS stage_1_status;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'budget_pdf_url') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS budget_pdf_url;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'budget_approved_at') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS budget_approved_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'budget_rejected_at') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS budget_rejected_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'budget_rejection_reason') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS budget_rejection_reason;
  END IF;
  
  -- Remove colunas de stage_2
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'stage_2_status') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS stage_2_status;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'import_summary') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS import_summary;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'prices_visible') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS prices_visible;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'ledbras_analysis_completed_at') THEN
    ALTER TABLE orders DROP COLUMN IF EXISTS ledbras_analysis_completed_at;
  END IF;
  
  -- Remove todas as outras colunas de stages 3-9
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_3_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS contract_link;
  ALTER TABLE orders DROP COLUMN IF EXISTS contract_signed_at;
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_4_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS production_payment_link;
  ALTER TABLE orders DROP COLUMN IF EXISTS production_payment_amount_usd;
  ALTER TABLE orders DROP COLUMN IF EXISTS production_paid_at;
  ALTER TABLE orders DROP COLUMN IF EXISTS production_payment_proof_url;
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_5_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS customize_logo;
  ALTER TABLE orders DROP COLUMN IF EXISTS logo_file_url;
  ALTER TABLE orders DROP COLUMN IF EXISTS production_photos;
  ALTER TABLE orders DROP COLUMN IF EXISTS production_videos;
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_6_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS shipping_costs_pdf_url;
  ALTER TABLE orders DROP COLUMN IF EXISTS shipping_payment_amount_brl;
  ALTER TABLE orders DROP COLUMN IF EXISTS shipping_payment_deadline;
  ALTER TABLE orders DROP COLUMN IF EXISTS shipping_payment_proof_url;
  ALTER TABLE orders DROP COLUMN IF EXISTS shipping_paid_at;
  ALTER TABLE orders DROP COLUMN IF EXISTS shipping_tracking_code;
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_7_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS documents_form_link;
  ALTER TABLE orders DROP COLUMN IF EXISTS documents_submitted_at;
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_8_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS customs_costs_pdf_url;
  ALTER TABLE orders DROP COLUMN IF EXISTS customs_payment_amount_brl;
  ALTER TABLE orders DROP COLUMN IF EXISTS customs_payment_deadline;
  ALTER TABLE orders DROP COLUMN IF EXISTS customs_payment_proof_url;
  ALTER TABLE orders DROP COLUMN IF EXISTS customs_paid_at;
  ALTER TABLE orders DROP COLUMN IF EXISTS customs_cleared_at;
  ALTER TABLE orders DROP COLUMN IF EXISTS stage_9_status;
  ALTER TABLE orders DROP COLUMN IF EXISTS delivery_address;
  ALTER TABLE orders DROP COLUMN IF EXISTS delivery_date;
  ALTER TABLE orders DROP COLUMN IF EXISTS delivery_photos;
  ALTER TABLE orders DROP COLUMN IF EXISTS final_notes;
END $$;

-- Adiciona novas colunas JSONB
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stage_1_data JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stage_2_data JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stage_3_data JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS detailed_costs JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS costs_visible BOOLEAN DEFAULT false;