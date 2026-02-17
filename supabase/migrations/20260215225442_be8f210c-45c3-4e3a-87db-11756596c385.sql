-- Allow admin/uploader to update lesson file names
CREATE POLICY "Uploader or admin can update lesson files"
ON public.turma_lesson_files
FOR UPDATE
USING (
  (uploaded_by = auth.uid()) OR (get_turma_role(auth.uid(), turma_id) = 'admin'::turma_role)
);