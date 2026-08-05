ALTER TABLE public.review_logs DROP CONSTRAINT review_logs_card_id_fkey;
ALTER TABLE public.review_logs
  ADD CONSTRAINT review_logs_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE;

ALTER TABLE public.exam_questions DROP CONSTRAINT exam_questions_card_id_fkey;
ALTER TABLE public.exam_questions
  ADD CONSTRAINT exam_questions_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE SET NULL;