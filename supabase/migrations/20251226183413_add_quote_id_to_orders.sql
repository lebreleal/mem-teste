/*
  # Adicionar referência de cotação aos pedidos
  
  1. Mudanças
    - Adiciona coluna quote_id na tabela orders para referenciar a cotação original
    - Permite recuperar dados do n8n_response para exibir orçamento detalhado
  
  2. Segurança
    - Mantém policies existentes
*/

-- Adiciona coluna quote_id se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'quote_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN quote_id uuid REFERENCES quotes(id);
  END IF;
END $$;