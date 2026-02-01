-- Create table for quote questions (questionnaire step)
CREATE TABLE public.quote_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  order_position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.quote_questions ENABLE ROW LEVEL SECURITY;

-- RLS policies for quote_questions
CREATE POLICY "Anyone can view active questions" 
ON public.quote_questions 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage questions" 
ON public.quote_questions 
FOR ALL 
USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.is_admin = true));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_quote_questions_updated_at
BEFORE UPDATE ON public.quote_questions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add questionnaire_answers column to quotes table to store user answers
ALTER TABLE public.quotes 
ADD COLUMN questionnaire_answers JSONB DEFAULT NULL;