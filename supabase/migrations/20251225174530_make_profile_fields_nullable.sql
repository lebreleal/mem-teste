/*
  # Tornar campos de perfil opcionais
  
  1. Alteracoes
    - Torna name, document, city, state nullable
    - Apenas whatsapp permanece obrigatorio
  
  2. Motivo
    - Usuario deve poder criar perfil apenas com WhatsApp
    - Outros campos podem ser preenchidos depois
*/

ALTER TABLE user_profiles ALTER COLUMN name DROP NOT NULL;
ALTER TABLE user_profiles ALTER COLUMN document DROP NOT NULL;
ALTER TABLE user_profiles ALTER COLUMN city DROP NOT NULL;
ALTER TABLE user_profiles ALTER COLUMN state DROP NOT NULL;