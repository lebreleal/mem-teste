/**
 * useContentImport – deck/exam import logic for the community ContentTab.
 * All copies are independent — no sync/update system.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from '../TurmaDetailContext';
import { useDecks } from '@/hooks/useDecks';
import type { TurmaDeck, TurmaExam } from '@/types/turma';
import type { Json } from '@/integrations/supabase/types';

const resolveNameConflict = (baseName: string, existingNames: string[]): string => {
  if (!existingNames.includes(baseName)) return baseName;
  let suffix = 1;
  let candidate = `${baseName} (cópia)`;
  while (existingNames.includes(candidate)) { suffix++; candidate = `${baseName} (cópia ${suffix})`; }
  return candidate;
};

/** Row shape from the original deck query */
interface OriginalDeckRow {
  name: string;
  algorithm_mode: string;
  daily_new_limit: number;
  daily_review_limit: number;
}

/** Row shape for copied cards */
interface CardCopyRow {
  front_content: string;
  back_content: string;
  card_type: string;
}

/** Row shape for newly inserted deck */
interface NewDeckRow {
  id: string;
  name: string;
}

/** Row shape for personal exams */
interface PersonalExamRow {
  id: string;
  title: string;
  total_points: number;
  time_limit_seconds: number | null;
  created_at: string;
}

/** Row shape for exam question counts */
interface ExamQuestionCountRow {
  exam_id: string;
}

/** Turma exam question row for import */
interface TurmaExamQuestionRow {
  question_type: string;
  question_text: string;
  options: Json | null;
  correct_answer: string;
  correct_indices: number[] | null;
  points: number;
  sort_order: number;
}

/** Exam question row for personal exam import */
interface PersonalExamQuestionRow {
  question_type: string;
  question_text: string;
  options: Json | null;
  correct_answer: string;
  correct_indices: number[] | null;
  points: number;
  sort_order: number;
}

interface FolderRow { id: string; name: string }

export const useContentImport = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, turma, subjects, contentFolderId,
    turmaDecks, isAdmin, isMod, isSubscriber, user,
    toast, navigate,
  } = ctx;
  const queryClient = useQueryClient();
  const { decks: userDecks } = useDecks();
  

  const [showImportExam, setShowImportExam] = useState(false);
  const [importingExamId, setImportingExamId] = useState<string | null>(null);

  // ── Fetch user's imported exams (to know which turma exams are already imported) ──
  const { data: userImportedExams = [] } = useQuery({
    queryKey: ['user-imported-exams', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('exams')
        .select('id, source_turma_exam_id')
        .eq('user_id', user.id)
        .not('source_turma_exam_id', 'is', null);
      return (data ?? []) as { id: string; source_turma_exam_id: string }[];
    },
    enabled: !!user,
  });

  // ── Deck helpers ──
  const userOwnsDeck = (deckId: string) => userDecks.some(d => d.id === deckId);
  const userHasLinkedDeck = (turmaDeckId: string) => userDecks.some(d => d.source_turma_deck_id === turmaDeckId && !d.is_archived);
  const isDeckFree = (td: TurmaDeck) => !td.price_type || td.price_type === 'free';
  const canAccessDeck = (td: TurmaDeck) => {
    if (isDeckFree(td)) return true;
    if (td.shared_by === user?.id || userOwnsDeck(td.deck_id)) return true;
    if (isAdmin || isMod || isSubscriber) return true;
    return false;
  };

  // ── Exam helpers ──
  const userHasImportedExam = (turmaExamId: string) =>
    userImportedExams.some(e => e.source_turma_exam_id === turmaExamId);

  const getPersonalDeckId = (turmaDeckId: string): string | null => {
    const d = userDecks.find(d => d.source_turma_deck_id === turmaDeckId && !d.is_archived);
    return d?.id ?? null;
  };

  const getPersonalExamId = (turmaExamId: string): string | null => {
    const e = userImportedExams.find(e => e.source_turma_exam_id === turmaExamId);
    return e?.id ?? null;
  };

  const sharedDeckIds = new Set(turmaDecks.map(d => d.deck_id));
  const availableDecks = userDecks.filter(d => !sharedDeckIds.has(d.id) && !d.is_archived && !d.source_turma_deck_id);

  // ── Add to collection (flat copy + linked folder) ──
  const addToCollection = useMutation({
    mutationFn: async (td: TurmaDeck) => {
      if (!user || !turma) throw new Error('Not authenticated');
      if (!isDeckFree(td) && !isSubscriber && !isAdmin && !isMod && td.shared_by !== user.id) throw new Error('SUBSCRIBER_ONLY');

      // 1. Ensure a linked folder (sala) exists for this community
      const { data: existingFolders } = await supabase.from('folders')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('source_turma_id', turmaId);
      
      let targetFolderId: string | null = null;
      if (existingFolders && existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        // Create a linked folder for this community
        const folderName = turma.name || 'Comunidade';
        const { data: newFolder, error: folderErr } = await supabase.from('folders')
          .insert({
            user_id: user.id,
            name: folderName,
            section: 'community',
            source_turma_id: turmaId,
          })
          .select('id')
          .single();
        if (folderErr) throw folderErr;
        targetFolderId = newFolder!.id;
      }

      // 2. Copy the deck (flat, no hierarchy)
      const { data: originalDeck } = await supabase.from('decks').select('name, algorithm_mode, daily_new_limit, daily_review_limit').eq('id', td.deck_id).single();
      if (!originalDeck) throw new Error('Deck não encontrado');
      const od = originalDeck as OriginalDeckRow;

      const { data: freshDecks } = await supabase.from('decks').select('name').eq('user_id', user.id).eq('folder_id', targetFolderId);
      const existingNames = (freshDecks ?? []).map(d => d.name);
      const deckName = resolveNameConflict(od.name, existingNames);

      const { data: newDeck } = await supabase.from('decks').insert({
        name: deckName,
        user_id: user.id,
        folder_id: targetFolderId,
        algorithm_mode: od.algorithm_mode ?? 'fsrs',
        daily_new_limit: od.daily_new_limit ?? 20,
        daily_review_limit: od.daily_review_limit ?? 9999,
        source_turma_deck_id: td.id,
      }).select('id, name').single();

      if (newDeck) {
        const { data: cards } = await supabase.from('cards')
          .select('front_content, back_content, card_type')
          .eq('deck_id', td.deck_id);
        const typedCards = (cards ?? []) as CardCopyRow[];
        if (typedCards.length > 0) {
          await supabase.from('cards').insert(
            typedCards.map(c => ({
              deck_id: newDeck.id,
              front_content: c.front_content,
              back_content: c.back_content,
              card_type: c.card_type,
              state: 0, stability: 0, difficulty: 0,
            })),
          );
        }
      }
      return newDeck as NewDeckRow | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: '✅ Baralho adicionado à sua coleção!' });
    },
    onError: (err: Error) => {
      if (err?.message === 'SUBSCRIBER_ONLY') toast({ title: 'Conteúdo exclusivo para assinantes', variant: 'destructive' });
      else toast({ title: 'Erro ao adicionar baralho', variant: 'destructive' });
    },
  });

  const downloadDeck = useMutation({
    mutationFn: async (td: TurmaDeck) => {
      if (!user || !turma) throw new Error('Not authenticated');

      // Ensure linked folder exists
      const { data: existingFolders } = await supabase.from('folders')
        .select('id').eq('user_id', user.id).eq('source_turma_id', turmaId);
      let targetFolderId: string | null = null;
      if (existingFolders && existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const { data: newFolder } = await supabase.from('folders')
          .insert({ user_id: user.id, name: turma.name || 'Comunidade', section: 'community', source_turma_id: turmaId })
          .select('id').single();
        targetFolderId = newFolder?.id ?? null;
      }

      const { data: originalDeck } = await supabase.from('decks').select('name, algorithm_mode, daily_new_limit, daily_review_limit').eq('id', td.deck_id).single();
      if (!originalDeck) throw new Error('Deck não encontrado');
      const od = originalDeck as OriginalDeckRow;
      const { data: freshDecks } = await supabase.from('decks').select('name').eq('user_id', user.id).eq('folder_id', targetFolderId);
      const existingNames = (freshDecks ?? []).map(d => d.name);
      const childName = resolveNameConflict(od.name, existingNames);
      const { data: newDeck } = await supabase.from('decks').insert({
        name: childName, user_id: user.id, folder_id: targetFolderId,
        algorithm_mode: od.algorithm_mode, daily_new_limit: od.daily_new_limit, daily_review_limit: od.daily_review_limit,
        source_turma_deck_id: td.id,
      }).select('id, name').single();
      if (newDeck) {
        const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', td.deck_id);
        const typedCards = (cards ?? []) as CardCopyRow[];
        if (typedCards.length > 0) {
          await supabase.from('cards').insert(typedCards.map(c => ({ deck_id: newDeck.id, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type, state: 0, stability: 0, difficulty: 0 })));
        }
      }
      return newDeck as NewDeckRow | null;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['decks'] }); queryClient.invalidateQueries({ queryKey: ['folders'] }); toast({ title: 'Baralho baixado!' }); },
    onError: () => toast({ title: 'Erro ao baixar', variant: 'destructive' }),
  });

  // ── Exam import (personal → turma) ──
  const { data: personalExams = [], isLoading: loadingExams } = useQuery({
    queryKey: ['personal-exams-for-import', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('exams').select('id, title, total_points, time_limit_seconds, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false });
      return (data ?? []) as PersonalExamRow[];
    },
    enabled: showImportExam && !!user,
  });

  const personalExamIds = personalExams.map(e => e.id);
  const { data: personalQuestionCounts = {} } = useQuery({
    queryKey: ['personal-exam-qcounts', personalExamIds],
    queryFn: async () => {
      if (personalExamIds.length === 0) return {};
      const { data } = await supabase.from('exam_questions').select('exam_id').in('exam_id', personalExamIds);
      const counts: Record<string, number> = {};
      ((data ?? []) as ExamQuestionCountRow[]).forEach(q => { counts[q.exam_id] = (counts[q.exam_id] || 0) + 1; });
      return counts;
    },
    enabled: personalExamIds.length > 0,
  });

  const handleImportExamToTurma = async (exam: PersonalExamRow) => {
    setImportingExamId(exam.id);
    try {
      if (!user || !turmaId) return;
      const { data: questions, error } = await supabase.from('exam_questions').select('id, exam_id, question_type, question_text, options, correct_answer, correct_indices, points, sort_order, card_id, is_graded, scored_points, selected_indices, user_answer, ai_feedback, created_at').eq('exam_id', exam.id).order('sort_order', { ascending: true });
      if (error) throw error;
      if (!questions?.length) { toast({ title: 'Prova sem questões', variant: 'destructive' }); return; }
      const typedQuestions = questions as PersonalExamQuestionRow[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_exams not in generated types
      const { data: turmaExam, error: examError } = await (supabase.from('turma_exams' as 'exams') as ReturnType<typeof supabase.from>).insert({
        turma_id: turmaId, created_by: user.id, title: exam.title || 'Prova Importada',
        time_limit_seconds: exam.time_limit_seconds || null, is_published: true,
        total_questions: typedQuestions.length, subject_id: contentFolderId,
      } as Record<string, unknown>).select().single();
      if (examError) throw examError;
      const teId = (turmaExam as unknown as { id: string }).id;
      const questionsToInsert = typedQuestions.map((q, idx) => ({
        exam_id: teId, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer,
        correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_exam_questions not in generated types
      await (supabase.from('turma_exam_questions' as 'exam_questions') as ReturnType<typeof supabase.from>).insert(questionsToInsert as unknown as Record<string, unknown>[]);
      queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
      toast({ title: 'Prova importada!' });
      setShowImportExam(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao importar', description: msg, variant: 'destructive' });
    } finally { setImportingExamId(null); }
  };

  // ── Add exam to collection (independent copy) ──
  const addExamToCollection = useMutation({
    mutationFn: async (exam: TurmaExam) => {
      if (!user || !turma) throw new Error('Not authenticated');
      const { data: existingFolders } = await supabase.from('exam_folders')
        .select('id, name').eq('user_id', user.id);
      const communityFolderName = turma.name || 'Comunidade';
      let examFolder: FolderRow | undefined = (existingFolders || []).find(f => f.name === communityFolderName);
      if (!examFolder) {
        const { data: newFolder, error: folderErr } = await supabase.from('exam_folders')
          .insert({ user_id: user.id, name: communityFolderName }).select('id, name').single();
        if (folderErr) throw folderErr;
        examFolder = newFolder as FolderRow;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- turma_exam_questions not in generated types
      const { data: questions } = await (supabase.from('turma_exam_questions' as 'exam_questions') as ReturnType<typeof supabase.from>).select('id, exam_id, question_type, question_text, options, correct_answer, correct_indices, points, sort_order, question_id, created_at').eq('exam_id', exam.id).order('sort_order', { ascending: true });
      const typedQuestions = (questions ?? []) as unknown as TurmaExamQuestionRow[];
      const totalPoints = typedQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
      const { data: newExam, error: examError } = await supabase.from('exams')
        .insert({
          user_id: user.id, deck_id: null, title: exam.title, status: 'pending',
          total_points: totalPoints, time_limit_seconds: exam.time_limit_seconds || null,
          folder_id: examFolder?.id || null,
          source_turma_exam_id: exam.id,
        })
        .select('id').single();
      if (examError) throw examError;
      const questionsToInsert = typedQuestions.map((q, idx) => ({
        exam_id: newExam!.id, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer, correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      await supabase.from('exam_questions').insert(questionsToInsert);
      return { examId: newExam!.id, folderName: communityFolderName, turmaExamId: exam.id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam-folders'] });
      queryClient.invalidateQueries({ queryKey: ['user-imported-exams'] });
      toast({ title: '✅ Prova adicionada à coleção!', description: `Na pasta "${result.folderName}".` });
    },
    onError: (err: Error) => toast({ title: 'Erro ao importar prova', description: err.message, variant: 'destructive' }),
  });

  return {
    userOwnsDeck,
    userHasLinkedDeck,
    userHasImportedExam,
    getPersonalDeckId,
    getPersonalExamId,
    isDeckFree,
    canAccessDeck,
    availableDecks,
    addToCollection,
    downloadDeck,
    showImportExam,
    setShowImportExam,
    importingExamId,
    personalExams,
    loadingExams,
    personalQuestionCounts,
    handleImportExamToTurma,
    addExamToCollection,
  };
};