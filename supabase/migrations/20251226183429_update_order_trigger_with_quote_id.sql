/*
  # Atualizar trigger para incluir quote_id
  
  1. Mudanças
    - Atualiza função create_order_from_quote para incluir quote_id
    - Permite recuperar dados do orçamento original
*/

-- Atualiza função para incluir quote_id
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
    quote_id,
    order_number,
    current_stage,
    created_at,
    updated_at
  ) VALUES (
    NEW.user_id,
    NEW.id,
    new_order_number,
    1,
    NOW(),
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;