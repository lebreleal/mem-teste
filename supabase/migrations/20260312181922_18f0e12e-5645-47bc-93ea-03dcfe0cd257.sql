
-- Add category and subcategory to global_concepts for medical taxonomy
-- Based on Estratégia MED / Medway / SanarFlix standard:
-- 5 Grandes Áreas: Clínica Médica, Cirurgia, Ginecologia e Obstetrícia, Pediatria, Medicina Preventiva
ALTER TABLE public.global_concepts
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subcategory TEXT DEFAULT NULL;

-- Index for efficient grouping
CREATE INDEX IF NOT EXISTS idx_global_concepts_category ON public.global_concepts (user_id, category);
