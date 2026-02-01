/*
  # Trigger para criar pedido automaticamente ao criar cotação
  
  1. Nova Função
    - `create_order_from_quote()` - Cria um pedido automaticamente quando uma cotação é criada
  
  2. Trigger
    - `trigger_create_order_from_quote` - Dispara após inserção em quotes
  
  3. Comportamento
    - Gera número de pedido único
    - Cria pedido com stage_1_status='pending' e stage_2_status='awaiting_ledbras'
    - Liga o pedido ao usuário da cotação
*/

-- Função para criar order automaticamente ao criar quote
CREATE OR REPLACE FUNCTION create_order_from_quote()
RETURNS TRIGGER AS $$
DECLARE
  new_order_number TEXT;
BEGIN
  -- Gera número de pedido único baseado no timestamp
  new_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  
  -- Cria o pedido
  INSERT INTO orders (
    user_id,
    order_number,
    stage_1_status,
    stage_2_status,
    current_stage,
    created_at,
    updated_at
  ) VALUES (
    NEW.user_id,
    new_order_number,
    'pending',
    'awaiting_ledbras',
    1,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que executa após inserir uma cotação
DROP TRIGGER IF EXISTS trigger_create_order_from_quote ON quotes;
CREATE TRIGGER trigger_create_order_from_quote
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION create_order_from_quote();