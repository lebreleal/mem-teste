
ALTER TABLE public.global_concepts ADD COLUMN description text DEFAULT NULL;

COMMENT ON COLUMN public.global_concepts.description IS 'Brief neuroscience-informed description of the concept and how it relates to the question context. Helps metacognitive judgment.';
