/*
  # Sistema de Verificação por Código

  1. Nova Tabela
    - `verification_codes`
      - `id` (uuid, primary key)
      - `identifier` (text) - email ou telefone
      - `code` (text) - código de verificação
      - `expires_at` (timestamp) - expiração do código
      - `used` (boolean) - se o código foi usado
      - `created_at` (timestamp)

  2. Seguranca
    - Habilita RLS na tabela
    - Sem políticas públicas - acesso apenas via service role
*/

CREATE TABLE IF NOT EXISTS verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_verification_codes_identifier ON verification_codes(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
