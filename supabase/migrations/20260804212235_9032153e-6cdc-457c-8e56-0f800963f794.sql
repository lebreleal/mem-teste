CREATE TABLE public.ai_model_catalog (
  id uuid primary key default gen_random_uuid(),
  model_id text not null unique,
  label text not null,
  tier text not null default 'flash',
  prompt_usd_per_token numeric not null default 0,
  completion_usd_per_token numeric not null default 0,
  context_length integer not null default 0,
  is_active boolean not null default true,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.ai_model_catalog TO authenticated;
GRANT ALL ON public.ai_model_catalog TO service_role;

ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read model catalog"
ON public.ai_model_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage model catalog"
ON public.ai_model_catalog FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ai_model_catalog_updated_at
BEFORE UPDATE ON public.ai_model_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();