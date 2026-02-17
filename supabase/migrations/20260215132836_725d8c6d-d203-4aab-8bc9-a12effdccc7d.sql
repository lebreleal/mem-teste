
-- Create app_error_logs table
CREATE TABLE public.app_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  error_message TEXT NOT NULL DEFAULT '',
  error_stack TEXT DEFAULT '',
  component_name TEXT DEFAULT '',
  route TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'error',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own error logs
CREATE POLICY "Users can insert own error logs"
ON public.app_error_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Anon users can insert error logs (for unauthenticated errors)
CREATE POLICY "Anon can insert error logs"
ON public.app_error_logs
FOR INSERT TO anon
WITH CHECK (user_id IS NULL);

-- Admins can read all error logs
CREATE POLICY "Admins can read all error logs"
ON public.app_error_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete error logs
CREATE POLICY "Admins can delete error logs"
ON public.app_error_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for faster queries
CREATE INDEX idx_app_error_logs_created_at ON public.app_error_logs (created_at DESC);
CREATE INDEX idx_app_error_logs_severity ON public.app_error_logs (severity);
