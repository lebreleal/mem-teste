-- Add unique constraint for user_roles
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Add admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('06cfa099-1bd1-4de3-aa6d-f97d71535300', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;