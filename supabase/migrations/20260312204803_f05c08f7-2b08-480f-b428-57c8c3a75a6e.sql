
-- Add concept_tag_id to global_concepts to link personal concepts to official tags
ALTER TABLE public.global_concepts ADD COLUMN concept_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL;

-- Add is_concept flag to tags to mark studyable concept tags
ALTER TABLE public.tags ADD COLUMN is_concept boolean NOT NULL DEFAULT false;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_global_concepts_concept_tag_id ON public.global_concepts(concept_tag_id) WHERE concept_tag_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tags_is_concept ON public.tags(is_concept) WHERE is_concept = true;
