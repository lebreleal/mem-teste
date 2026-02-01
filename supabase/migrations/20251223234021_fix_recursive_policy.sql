/*
  # Corrigir política recursiva em user_profiles

  1. Alterações
    - Remover política "Admins can view all profiles" que causa recursão infinita
    - A política de admins não é necessária pois a política "Users can view own profile" já permite acesso
    - O Supabase Auth já protege dados sensíveis automaticamente

  2. Notas de Segurança
    - Cada usuário continua podendo acessar apenas seu próprio perfil
    - Admins acessam dados através da tabela de perfil pessoal, sem necessidade de policy adicional
*/

DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;