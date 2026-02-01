/*
  # Criar tabela de configurações administrativas

  1. Nova Tabela
    - `admin_settings`
      - `id` (uuid, primary key)
      - `setting_key` (text, unique) - chave da configuração
      - `setting_value` (jsonb) - valor da configuração
      - `description` (text) - descrição da configuração
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Segurança
    - Enable RLS
    - Apenas admins podem acessar
  
  3. Dados iniciais
    - Configuração do vídeo do YouTube
    - Mapeamento de variáveis do response n8n
*/

CREATE TABLE IF NOT EXISTS admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read settings"
  ON admin_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can insert settings"
  ON admin_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can update settings"
  ON admin_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

INSERT INTO admin_settings (setting_key, setting_value, description)
VALUES 
  ('video_config', '{"enabled": true, "youtube_url": "https://www.youtube.com/embed/dQw4w9WgXcQ"}'::jsonb, 'Configuração do vídeo explicativo'),
  ('n8n_field_mapping', '{}'::jsonb, 'Mapeamento de campos do response n8n')
ON CONFLICT (setting_key) DO NOTHING;
