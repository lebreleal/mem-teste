/*
  # Reestruturar fluxo de pedido com aprovação de orçamento
  
  1. Novos Campos
    - `budget_pdf_url` - URL do PDF de orçamento enviado ao cliente
    - `budget_approved` - Se o cliente aprovou o orçamento
    - `budget_approved_at` - Data/hora da aprovação do orçamento
    - `contract_pdf_url` - URL/link do contrato para assinatura (1.1)
    - `contract_signed` - Se o contrato foi assinado
    - `contract_signed_at` - Data/hora da assinatura
    
  2. Campos de Status Detalhados
    - `stage_1_status` - Status específico da etapa 1 (produção)
    - `stage_2_status` - Status específico da etapa 2 (embarque)
    - `stage_3_status` - Status específico da etapa 3 (liberação)
    
  3. Status possíveis:
    - awaiting_budget_approval - Aguardando aprovação do orçamento
    - awaiting_contract - Aguardando disponibilização do contrato
    - awaiting_signature - Aguardando assinatura do contrato
    - in_production - Em produção
    - production_complete - Produção completa
    - in_transit - Em trânsito
    - customs_clearance - Liberação aduaneira
    - delivered - Entregue
*/

-- Adiciona novos campos
DO $$ 
BEGIN
  -- Budget fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'budget_pdf_url'
  ) THEN
    ALTER TABLE orders ADD COLUMN budget_pdf_url TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'budget_approved'
  ) THEN
    ALTER TABLE orders ADD COLUMN budget_approved BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'budget_approved_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN budget_approved_at TIMESTAMPTZ;
  END IF;
  
  -- Contract fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'contract_pdf_url'
  ) THEN
    ALTER TABLE orders ADD COLUMN contract_pdf_url TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'contract_signed'
  ) THEN
    ALTER TABLE orders ADD COLUMN contract_signed BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'contract_signed_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN contract_signed_at TIMESTAMPTZ;
  END IF;
  
  -- Stage status fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'stage_1_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN stage_1_status TEXT DEFAULT 'awaiting_budget_approval';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'stage_2_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN stage_2_status TEXT DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'stage_3_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN stage_3_status TEXT DEFAULT 'pending';
  END IF;
END $$;