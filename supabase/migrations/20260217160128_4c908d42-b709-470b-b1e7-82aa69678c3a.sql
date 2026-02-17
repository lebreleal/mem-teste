
-- Revert ON DELETE CASCADE additions to match original schema exactly
-- The original schema uses explicit cascade functions (delete_deck_cascade, leave_turma, etc.)

-- cards.deck_id: original had no CASCADE
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_deck_id_fkey;
ALTER TABLE public.cards ADD CONSTRAINT cards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id);

-- review_logs.card_id: original had no CASCADE
ALTER TABLE public.review_logs DROP CONSTRAINT IF EXISTS review_logs_card_id_fkey;
ALTER TABLE public.review_logs ADD CONSTRAINT review_logs_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);

-- exam_questions.exam_id: original had no CASCADE, card_id had no SET NULL
ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_exam_id_fkey;
ALTER TABLE public.exam_questions ADD CONSTRAINT exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id);
ALTER TABLE public.exam_questions DROP CONSTRAINT IF EXISTS exam_questions_card_id_fkey;
ALTER TABLE public.exam_questions ADD CONSTRAINT exam_questions_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);

-- exams.deck_id: original had no CASCADE
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_deck_id_fkey;
ALTER TABLE public.exams ADD CONSTRAINT exams_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id);

-- exams.folder_id: add the FK that was in original
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_folder_id_fkey;
ALTER TABLE public.exams ADD CONSTRAINT exams_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.exam_folders(id);

-- turma_members: original had no CASCADE
ALTER TABLE public.turma_members DROP CONSTRAINT IF EXISTS turma_members_turma_id_fkey;
ALTER TABLE public.turma_members ADD CONSTRAINT turma_members_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);

-- turma_permissions: original had no CASCADE
ALTER TABLE public.turma_permissions DROP CONSTRAINT IF EXISTS turma_permissions_turma_id_fkey;
ALTER TABLE public.turma_permissions ADD CONSTRAINT turma_permissions_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);

-- turma_semesters: original had no CASCADE
ALTER TABLE public.turma_semesters DROP CONSTRAINT IF EXISTS turma_semesters_turma_id_fkey;
ALTER TABLE public.turma_semesters ADD CONSTRAINT turma_semesters_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);

-- turma_subjects: original had no CASCADE on turma_id, semester_id had no SET NULL
ALTER TABLE public.turma_subjects DROP CONSTRAINT IF EXISTS turma_subjects_turma_id_fkey;
ALTER TABLE public.turma_subjects ADD CONSTRAINT turma_subjects_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);
ALTER TABLE public.turma_subjects DROP CONSTRAINT IF EXISTS turma_subjects_semester_id_fkey;
ALTER TABLE public.turma_subjects ADD CONSTRAINT turma_subjects_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.turma_semesters(id);

-- turma_lessons: original had no CASCADE on turma_id, subject_id had no SET NULL
ALTER TABLE public.turma_lessons DROP CONSTRAINT IF EXISTS turma_lessons_turma_id_fkey;
ALTER TABLE public.turma_lessons ADD CONSTRAINT turma_lessons_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);
ALTER TABLE public.turma_lessons DROP CONSTRAINT IF EXISTS turma_lessons_subject_id_fkey;
ALTER TABLE public.turma_lessons ADD CONSTRAINT turma_lessons_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.turma_subjects(id);

-- turma_lesson_files: original had no CASCADE
ALTER TABLE public.turma_lesson_files DROP CONSTRAINT IF EXISTS turma_lesson_files_turma_id_fkey;
ALTER TABLE public.turma_lesson_files ADD CONSTRAINT turma_lesson_files_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);
ALTER TABLE public.turma_lesson_files DROP CONSTRAINT IF EXISTS turma_lesson_files_lesson_id_fkey;
ALTER TABLE public.turma_lesson_files ADD CONSTRAINT turma_lesson_files_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.turma_lessons(id);

-- turma_decks: original had no CASCADE
ALTER TABLE public.turma_decks DROP CONSTRAINT IF EXISTS turma_decks_turma_id_fkey;
ALTER TABLE public.turma_decks ADD CONSTRAINT turma_decks_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);
ALTER TABLE public.turma_decks DROP CONSTRAINT IF EXISTS turma_decks_deck_id_fkey;
ALTER TABLE public.turma_decks ADD CONSTRAINT turma_decks_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.decks(id);
-- Add subject_id and lesson_id FKs from original
ALTER TABLE public.turma_decks DROP CONSTRAINT IF EXISTS turma_decks_subject_id_fkey;
ALTER TABLE public.turma_decks ADD CONSTRAINT turma_decks_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.turma_subjects(id);
ALTER TABLE public.turma_decks DROP CONSTRAINT IF EXISTS turma_decks_lesson_id_fkey;
ALTER TABLE public.turma_decks ADD CONSTRAINT turma_decks_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.turma_lessons(id);

-- turma_questions: original had no CASCADE
ALTER TABLE public.turma_questions DROP CONSTRAINT IF EXISTS turma_questions_turma_id_fkey;
ALTER TABLE public.turma_questions ADD CONSTRAINT turma_questions_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);
ALTER TABLE public.turma_questions DROP CONSTRAINT IF EXISTS turma_questions_subject_id_fkey;
ALTER TABLE public.turma_questions ADD CONSTRAINT turma_questions_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.turma_subjects(id);
ALTER TABLE public.turma_questions DROP CONSTRAINT IF EXISTS turma_questions_lesson_id_fkey;
ALTER TABLE public.turma_questions ADD CONSTRAINT turma_questions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.turma_lessons(id);

-- turma_exams: original had no CASCADE
ALTER TABLE public.turma_exams DROP CONSTRAINT IF EXISTS turma_exams_turma_id_fkey;
ALTER TABLE public.turma_exams ADD CONSTRAINT turma_exams_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);
ALTER TABLE public.turma_exams DROP CONSTRAINT IF EXISTS turma_exams_subject_id_fkey;
ALTER TABLE public.turma_exams ADD CONSTRAINT turma_exams_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.turma_subjects(id);
ALTER TABLE public.turma_exams DROP CONSTRAINT IF EXISTS turma_exams_lesson_id_fkey;
ALTER TABLE public.turma_exams ADD CONSTRAINT turma_exams_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.turma_lessons(id);

-- turma_exam_questions: original had no CASCADE
ALTER TABLE public.turma_exam_questions DROP CONSTRAINT IF EXISTS turma_exam_questions_exam_id_fkey;
ALTER TABLE public.turma_exam_questions ADD CONSTRAINT turma_exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.turma_exams(id);
ALTER TABLE public.turma_exam_questions DROP CONSTRAINT IF EXISTS turma_exam_questions_question_id_fkey;
ALTER TABLE public.turma_exam_questions ADD CONSTRAINT turma_exam_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.turma_questions(id);

-- turma_exam_attempts: original had no CASCADE
ALTER TABLE public.turma_exam_attempts DROP CONSTRAINT IF EXISTS turma_exam_attempts_exam_id_fkey;
ALTER TABLE public.turma_exam_attempts ADD CONSTRAINT turma_exam_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.turma_exams(id);

-- turma_exam_answers: original had no CASCADE
ALTER TABLE public.turma_exam_answers DROP CONSTRAINT IF EXISTS turma_exam_answers_attempt_id_fkey;
ALTER TABLE public.turma_exam_answers ADD CONSTRAINT turma_exam_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.turma_exam_attempts(id);
ALTER TABLE public.turma_exam_answers DROP CONSTRAINT IF EXISTS turma_exam_answers_question_id_fkey;
ALTER TABLE public.turma_exam_answers ADD CONSTRAINT turma_exam_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.turma_exam_questions(id);

-- turma_ratings: original had no CASCADE
ALTER TABLE public.turma_ratings DROP CONSTRAINT IF EXISTS turma_ratings_turma_id_fkey;
ALTER TABLE public.turma_ratings ADD CONSTRAINT turma_ratings_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);

-- turma_subscriptions: original had no CASCADE
ALTER TABLE public.turma_subscriptions DROP CONSTRAINT IF EXISTS turma_subscriptions_turma_id_fkey;
ALTER TABLE public.turma_subscriptions ADD CONSTRAINT turma_subscriptions_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES public.turmas(id);

-- feature_votes: original had no CASCADE
ALTER TABLE public.feature_votes DROP CONSTRAINT IF EXISTS feature_votes_feature_id_fkey;
ALTER TABLE public.feature_votes ADD CONSTRAINT feature_votes_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.feature_requests(id);

-- feature_comments: original had no CASCADE
ALTER TABLE public.feature_comments DROP CONSTRAINT IF EXISTS feature_comments_feature_id_fkey;
ALTER TABLE public.feature_comments ADD CONSTRAINT feature_comments_feature_id_fkey FOREIGN KEY (feature_id) REFERENCES public.feature_requests(id);

-- ai_chat_messages: original had no CASCADE
ALTER TABLE public.ai_chat_messages DROP CONSTRAINT IF EXISTS ai_chat_messages_conversation_id_fkey;
ALTER TABLE public.ai_chat_messages ADD CONSTRAINT ai_chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id);
