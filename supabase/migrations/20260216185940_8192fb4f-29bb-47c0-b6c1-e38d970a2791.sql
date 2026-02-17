
-- Add subscribers_only flag to turma_exams
ALTER TABLE public.turma_exams ADD COLUMN subscribers_only boolean NOT NULL DEFAULT false;

-- Allow users to delete their own exam attempts (for restart)
CREATE POLICY "Users can delete own attempts"
ON public.turma_exam_attempts
FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own answers (for restart)
CREATE POLICY "Users can delete own answers"
ON public.turma_exam_answers
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM turma_exam_attempts a
  WHERE a.id = turma_exam_answers.attempt_id AND a.user_id = auth.uid()
));
