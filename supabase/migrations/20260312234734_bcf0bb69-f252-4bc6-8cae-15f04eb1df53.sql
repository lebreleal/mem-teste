ALTER TABLE public.global_concepts ADD COLUMN IF NOT EXISTS parent_concept_id uuid REFERENCES public.global_concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_global_concepts_parent ON public.global_concepts(parent_concept_id) WHERE parent_concept_id IS NOT NULL;