/*
  # Sistema de Histórico de Edição de Perfil

  1. Nova Tabela - profile_edit_history
    - `id` (uuid, primary key)
    - `user_id` (uuid, foreign key to user_profiles)
    - `old_name` (text)
    - `old_phone` (text)
    - `old_whatsapp` (text)
    - `old_cpf_cnpj` (text)
    - `new_name` (text)
    - `new_phone` (text)
    - `new_whatsapp` (text)
    - `new_cpf_cnpj` (text)
    - `edited_at` (timestamp)
    - `edited_by` (uuid) - ID do usuário que fez a edição

  2. Adicionar campo can_edit_profile em user_profiles
    - Controla se o usuário pode editar seu perfil

  3. Segurança
    - Enable RLS
    - Usuários podem ver apenas seu próprio histórico
    - Admins podem ver todos os históricos
*/

CREATE TABLE IF NOT EXISTS profile_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  old_name text,
  old_phone text,
  old_whatsapp text,
  old_cpf_cnpj text,
  new_name text,
  new_phone text,
  new_whatsapp text,
  new_cpf_cnpj text,
  edited_at timestamptz DEFAULT now(),
  edited_by uuid REFERENCES user_profiles(id)
);

ALTER TABLE profile_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own edit history"
  ON profile_edit_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all edit history"
  ON profile_edit_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only user can create own history"
  ON profile_edit_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
