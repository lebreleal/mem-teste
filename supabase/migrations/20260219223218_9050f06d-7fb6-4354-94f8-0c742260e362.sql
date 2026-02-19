-- Allow admins to delete individual token usage logs
CREATE POLICY "Admins can delete token usage"
ON public.ai_token_usage
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));