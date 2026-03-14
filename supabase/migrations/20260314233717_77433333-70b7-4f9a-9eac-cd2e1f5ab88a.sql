-- Hide the test turma "Uninove - T11B" from Descobrir and clean up FK refs
-- First detach decks from community (don't delete them, they have cards)
UPDATE decks SET community_id = NULL WHERE community_id = '0a891b00-eea6-4143-9200-99f826e6cd32';

-- Delete all dependent records
DELETE FROM turma_lesson_files WHERE lesson_id IN (SELECT id FROM turma_lessons WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32');
DELETE FROM lesson_content_folders WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_subscriptions WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_members WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_decks WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_ratings WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_exams WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_lessons WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_subjects WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turma_semesters WHERE turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM community_revenue_logs WHERE community_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM folders WHERE source_turma_id = '0a891b00-eea6-4143-9200-99f826e6cd32';
DELETE FROM turmas WHERE id = '0a891b00-eea6-4143-9200-99f826e6cd32';