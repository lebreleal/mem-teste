-- SECURITY HOTFIX: move admin role to dedicated roles table; remove anonymous access to quotes; update RLS to use has_role()

-- 1) Create roles enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

-- 2) Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Create security definer role-check function (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4) RLS for user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Migrate existing admins from user_profiles.is_admin -> user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT up.id, 'admin'::public.app_role
FROM public.user_profiles up
WHERE up.is_admin = true
ON CONFLICT (user_id, role) DO NOTHING;

-- 6) Fix search_path warning in DB function
CREATE OR REPLACE FUNCTION public.create_order_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_order_number TEXT;
BEGIN
  new_order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO public.orders (
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
$function$;

-- 7) Harden quotes table: REMOVE anonymous read/write
DROP POLICY IF EXISTS "Anon can select quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anon can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Service role full access quotes" ON public.quotes;

-- 8) Add admin read for user_profiles (needed for admin panels)
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
CREATE POLICY "Admins can read all profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 9) Update existing admin policies to use has_role() (replace profile.is_admin checks)

-- admin_quote_field_mappings
DROP POLICY IF EXISTS "Only admins can delete field mappings" ON public.admin_quote_field_mappings;
CREATE POLICY "Only admins can delete field mappings"
ON public.admin_quote_field_mappings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Only admins can insert field mappings" ON public.admin_quote_field_mappings;
CREATE POLICY "Only admins can insert field mappings"
ON public.admin_quote_field_mappings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Only admins can update field mappings" ON public.admin_quote_field_mappings;
CREATE POLICY "Only admins can update field mappings"
ON public.admin_quote_field_mappings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- admin_quote_settings
DROP POLICY IF EXISTS "Only admins can update quote settings" ON public.admin_quote_settings;
CREATE POLICY "Only admins can update quote settings"
ON public.admin_quote_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- admin_settings
DROP POLICY IF EXISTS "Only admins can insert settings" ON public.admin_settings;
CREATE POLICY "Only admins can insert settings"
ON public.admin_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Only admins can update settings" ON public.admin_settings;
CREATE POLICY "Only admins can update settings"
ON public.admin_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can read video config, admins can read all" ON public.admin_settings;
CREATE POLICY "Users can read video config, admins can read all"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (
  (setting_key = 'video_config')
  OR public.has_role(auth.uid(), 'admin')
);

-- banners
DROP POLICY IF EXISTS "Admins can manage banners" ON public.banners;
CREATE POLICY "Admins can manage banners"
ON public.banners
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- cabinet_models
DROP POLICY IF EXISTS "Admins can manage cabinet models" ON public.cabinet_models;
CREATE POLICY "Admins can manage cabinet models"
ON public.cabinet_models
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- included_items
DROP POLICY IF EXISTS "Only admins can manage included items" ON public.included_items;
CREATE POLICY "Only admins can manage included items"
ON public.included_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- n8n_field_config
DROP POLICY IF EXISTS "Only admins can manage n8n config" ON public.n8n_field_config;
CREATE POLICY "Only admins can manage n8n config"
ON public.n8n_field_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- order_tracking
DROP POLICY IF EXISTS "Admins can insert orders" ON public.order_tracking;
CREATE POLICY "Admins can insert orders"
ON public.order_tracking
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all orders" ON public.order_tracking;
CREATE POLICY "Admins can update all orders"
ON public.order_tracking
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all orders" ON public.order_tracking;
CREATE POLICY "Admins can view all orders"
ON public.order_tracking
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- orders
DROP POLICY IF EXISTS "Admins can insert orders" ON public.orders;
CREATE POLICY "Admins can insert orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Simplify user policies for orders (same semantics, less brittle)
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own order approvals and uploads" ON public.orders;
CREATE POLICY "Users can update own order approvals and uploads"
ON public.orders
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- products
DROP POLICY IF EXISTS "Admins podem gerenciar produtos" ON public.products;
CREATE POLICY "Admins podem gerenciar produtos"
ON public.products
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- spare_parts
DROP POLICY IF EXISTS "Admins podem gerenciar peças" ON public.spare_parts;
CREATE POLICY "Admins podem gerenciar peças"
ON public.spare_parts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- quote_accessories
DROP POLICY IF EXISTS "Admins can view all quote accessories" ON public.quote_accessories;
CREATE POLICY "Admins can view all quote accessories"
ON public.quote_accessories
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Only admins can manage quote accessories" ON public.quote_accessories;
CREATE POLICY "Only admins can manage quote accessories"
ON public.quote_accessories
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- quotes (admin policy)
DROP POLICY IF EXISTS "Admins podem ver todas as cotações" ON public.quotes;
CREATE POLICY "Admins podem ver todas as cotações"
ON public.quotes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));