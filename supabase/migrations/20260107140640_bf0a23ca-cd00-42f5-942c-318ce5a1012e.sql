-- Create profiles table with CNPJ/CPF data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
  document_number TEXT NOT NULL,
  company_name TEXT,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create products table (admin manages these)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('outdoor', 'indoor', 'rental')),
  pitch TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Everyone can view active products
CREATE POLICY "Anyone can view active products" 
ON public.products 
FOR SELECT 
USING (is_active = true);

-- Only admins can manage products
CREATE POLICY "Admins can manage products" 
ON public.products 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Create quotes table
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_type TEXT NOT NULL CHECK (product_type IN ('outdoor', 'indoor', 'rental')),
  pitch TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('proprio', 'comercial')),
  pcb_type TEXT NOT NULL,
  cabinet_quantity INTEGER NOT NULL,
  cabinet_layout TEXT NOT NULL,
  delivery_cep TEXT NOT NULL,
  delivery_city TEXT,
  delivery_state TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'quoted', 'approved', 'rejected')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Users can view their own quotes
CREATE POLICY "Users can view their own quotes" 
ON public.quotes 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own quotes
CREATE POLICY "Users can create their own quotes" 
ON public.quotes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Admins can view all quotes
CREATE POLICY "Admins can view all quotes" 
ON public.quotes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Admins can update all quotes
CREATE POLICY "Admins can update all quotes" 
ON public.quotes 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at
BEFORE UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default products
INSERT INTO public.products (name, product_type, pitch, description) VALUES
('Painel LED Outdoor P4', 'outdoor', 'P4', 'Painel LED Outdoor P4 - Alta definição para uso externo'),
('Painel LED Outdoor P5', 'outdoor', 'P5', 'Painel LED Outdoor P5 - Melhor custo-benefício para outdoor'),
('Painel LED Outdoor P8', 'outdoor', 'P8', 'Painel LED Outdoor P8 - Ideal para grandes distâncias'),
('Painel LED Outdoor P10', 'outdoor', 'P10', 'Painel LED Outdoor P10 - Economia para projetos grandes');