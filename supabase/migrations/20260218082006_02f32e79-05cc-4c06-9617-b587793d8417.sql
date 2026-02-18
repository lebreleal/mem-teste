
-- Allow users to delete their own review logs (needed for reset progress)
CREATE POLICY "Users can delete own review logs"
ON public.review_logs
FOR DELETE
USING (auth.uid() = user_id);
