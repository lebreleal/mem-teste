/*
  # Sistema de Autenticação e Dashboard Ledbras

  1. Novas Tabelas
    - `user_profiles`
      - `id` (uuid, primary key, referencia auth.users)
      - `name` (text) - Nome completo
      - `document` (text) - CPF ou CNPJ
      - `city` (text) - Cidade
      - `state` (text) - Estado
      - `whatsapp` (text) - WhatsApp
      - `is_admin` (boolean) - Se é administrador
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, referencia auth.users)
      - `order_number` (text) - Número do pedido
      - `status` (text) - Status do pedido
      - `description` (text) - Descrição
      - `panel_width` (numeric) - Largura do painel
      - `panel_height` (numeric) - Altura do painel
      - `cabinet_type` (text) - Tipo de gabinete
      - `cabinet_quantity` (integer) - Quantidade de gabinetes
      - `notes` (text) - Observações do admin
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `banners`
      - `id` (uuid, primary key)
      - `position` (integer) - Posição (1 ou 2)
      - `image_url` (text) - URL da imagem
      - `link_url` (text) - URL de destino
      - `is_active` (boolean) - Se está ativo
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `cabinet_models`
      - `id` (uuid, primary key)
      - `name` (text) - Nome do modelo
      - `code` (text) - Código único
      - `is_active` (boolean)
      - `created_at` (timestamptz)

  2. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas para usuários autenticados
    - Políticas especiais para admins
*/

-- Tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  document text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  whatsapp text NOT NULL,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Tabela de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_number text UNIQUE NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  description text,
  panel_width numeric,
  panel_height numeric,
  cabinet_type text,
  cabinet_quantity integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Tabela de banners
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position integer NOT NULL CHECK (position IN (1, 2)),
  image_url text,
  link_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(position)
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners"
  ON banners FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage banners"
  ON banners FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Tabela de modelos de gabinete
CREATE TABLE IF NOT EXISTS cabinet_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cabinet_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active cabinet models"
  ON cabinet_models FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage cabinet models"
  ON cabinet_models FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = true
    )
  );

-- Inserir banners vazios iniciais
INSERT INTO banners (position, is_active) VALUES (1, true) ON CONFLICT (position) DO NOTHING;
INSERT INTO banners (position, is_active) VALUES (2, true) ON CONFLICT (position) DO NOTHING;

-- Inserir modelos de gabinete padrão
INSERT INTO cabinet_models (name, code, is_active) VALUES 
  ('Gabinete Outdoor 96x96cm P5', 'outdoor-96x96-p5', true),
  ('Gabinete Outdoor 96x96cm P8', 'outdoor-96x96-p8', true)
ON CONFLICT (code) DO NOTHING;