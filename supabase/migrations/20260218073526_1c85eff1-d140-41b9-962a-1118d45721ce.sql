
-- Add unique constraint on feature_key for ai_prompts
ALTER TABLE public.ai_prompts ADD CONSTRAINT ai_prompts_feature_key_unique UNIQUE (feature_key);
