-- Inserir profile para usuário existente que não tem perfil
INSERT INTO public.profiles (user_id, document_type, document_number, full_name, is_admin)
SELECT 
  u.id,
  'cnpj',
  '00000000000000',
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  true  -- Primeiro usuário será admin
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL
ON CONFLICT (user_id) DO NOTHING;