/**
 * useContentImport – deck/exam import logic for the community ContentTab.
 * All copies are independent — no sync/update system.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from '../TurmaDetailContext';
import { useDecks } from '@/hooks/useDecks';

const resolveNameConflict = (baseName: string, existingNames: string[]): string => {
  if (!existingNames.includes(baseName)) return baseName;
  let suffix = 1;
  let candidate = `${baseName} (cópia)`;
  while (existingNames.includes(candidate)) { suffix++; candidate = `${baseName} (cópia ${suffix})`; }
  return candidate;
};

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
  const userHasLinkedDeck = (turmaDeckId: string) => userDecks.some(d => (d as any).source_turma_deck_id === turmaDeckId && !d.is_archived);
  const isDeckFree = (td: any) => !td.price_type || td.price_type === 'free';
  const canAccessDeck = (td: any) => {
    if (isDeckFree(td)) return true;
    if (td.shared_by === user?.id || userOwnsDeck(td.deck_id)) return true;
    if (isAdmin || isMod || isSubscriber) return true;
    return false;
  };

  // ── Exam helpers ──
  const userHasImportedExam = (turmaExamId: string) =>
    userImportedExams.some(e => e.source_turma_exam_id === turmaExamId);

  const getPersonalDeckId = (turmaDeckId: string): string | null => {
    const d = userDecks.find(d => (d as any).source_turma_deck_id === turmaDeckId && !d.is_archived);
    return d?.id ?? null;
  };

  const getPersonalExamId = (turmaExamId: string): string | null => {
    const e = userImportedExams.find(e => e.source_turma_exam_id === turmaExamId);
    return e?.id ?? null;
  };

  const sharedDeckIds = new Set(turmaDecks.map(d => d.deck_id));
  const availableDecks = userDecks.filter(d => !sharedDeckIds.has(d.id) && !d.is_archived && !(d as any).source_turma_deck_id);

  // ── Add to collection (flat copy + linked folder) ──
  const addToCollection = useMutation({
    mutationFn: async (td: any) => {
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
          } as any)
          .select()
          .single();
        if (folderErr) throw folderErr;
        targetFolderId = (newFolder as any).id;
      }

      // 2. Copy the deck (flat, no hierarchy)
      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', td.deck_id).single();
      if (!originalDeck) throw new Error('Deck não encontrado');
      const od = originalDeck as any;

      const { data: freshDecks } = await supabase.from('decks').select('name').eq('user_id', user.id).eq('folder_id', targetFolderId);
      const existingNames = (freshDecks ?? []).map((d: any) => d.name);
      const deckName = resolveNameConflict(od.name, existingNames);

      const { data: newDeck } = await supabase.from('decks').insert({
        name: deckName,
        user_id: user.id,
        folder_id: targetFolderId,
        algorithm_mode: od.algorithm_mode ?? 'fsrs',
        daily_new_limit: od.daily_new_limit ?? 20,
        daily_review_limit: od.daily_review_limit ?? 9999,
        source_turma_deck_id: td.id,
      } as any).select().single();

      if (newDeck) {
        const { data: cards } = await supabase.from('cards')
          .select('front_content, back_content, card_type')
          .eq('deck_id', td.deck_id);
        if (cards?.length) {
          await supabase.from('cards').insert(
            cards.map((c: any) => ({
              deck_id: (newDeck as any).id,
              front_content: c.front_content,
              back_content: c.back_content,
              card_type: c.card_type,
              state: 0, stability: 0, difficulty: 0,
            })) as any,
          );
        }
      }
      return newDeck;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: '✅ Baralho adicionado à sua coleção!' });
    },
    onError: (err: any) => {
      if (err?.message === 'SUBSCRIBER_ONLY') toast({ title: 'Conteúdo exclusivo para assinantes', variant: 'destructive' });
      else toast({ title: 'Erro ao adicionar baralho', variant: 'destructive' });
    },
  });

  const downloadDeck = useMutation({
    mutationFn: async (td: any) => {
      if (!user || !turma) throw new Error('Not authenticated');
      const { data: freshDecks } = await supabase.from('decks').select('*').eq('user_id', user.id);
      const latestDecks = (freshDecks || []) as any[];

      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', td.deck_id).single();
      if (!originalDeck) throw new Error('Deck não encontrado');
      const od = originalDeck as any;
      const existingNames = latestDecks.filter((d: any) => !d.parent_deck_id && !d.folder_id).map((d: any) => d.name);
      const childName = resolveNameConflict(od.name, existingNames);
      const { data: newDeck } = await supabase.from('decks').insert({
        name: childName, user_id: user.id,
        algorithm_mode: od.algorithm_mode, daily_new_limit: od.daily_new_limit, daily_review_limit: od.daily_review_limit,
        source_turma_deck_id: td.id,
      } as any).select().single();
      if (newDeck) {
        const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', td.deck_id);
        if (cards?.length) await supabase.from('cards').insert(cards.map((c: any) => ({ deck_id: (newDeck as any).id, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type, state: 0, stability: 0, difficulty: 0 })) as any);
      }
      return newDeck;
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
      return data ?? [];
    },
    enabled: showImportExam && !!user,
  });

  const personalExamIds = personalExams.map((e: any) => e.id);
  const { data: personalQuestionCounts = {} } = useQuery({
    queryKey: ['personal-exam-qcounts', personalExamIds],
    queryFn: async () => {
      if (personalExamIds.length === 0) return {};
      const { data } = await supabase.from('exam_questions').select('exam_id').in('exam_id', personalExamIds);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((q: any) => { counts[q.exam_id] = (counts[q.exam_id] || 0) + 1; });
      return counts;
    },
    enabled: personalExamIds.length > 0,
  });

  const handleImportExamToTurma = async (exam: any) => {
    setImportingExamId(exam.id);
    try {
      if (!user || !turmaId) return;
      const { data: questions, error } = await supabase.from('exam_questions').select('*').eq('exam_id', exam.id).order('sort_order', { ascending: true });
      if (error) throw error;
      if (!questions?.length) { toast({ title: 'Prova sem questões', variant: 'destructive' }); return; }
      const { data: turmaExam, error: examError } = await supabase.from('turma_exams').insert({
        turma_id: turmaId, created_by: user.id, title: exam.title || 'Prova Importada',
        time_limit_seconds: exam.time_limit_seconds || null, is_published: true,
        total_questions: questions.length, subject_id: contentFolderId,
      } as any).select().single();
      if (examError) throw examError;
      const questionsToInsert = questions.map((q: any, idx: number) => ({
        exam_id: (turmaExam as any).id, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer,
        correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      await supabase.from('turma_exam_questions').insert(questionsToInsert as any);
      queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
      toast({ title: 'Prova importada!' });
      setShowImportExam(false);
    } catch (err: any) {
      toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' });
    } finally { setImportingExamId(null); }
  };

  // ── Add exam to collection (independent copy) ──
  const addExamToCollection = useMutation({
    mutationFn: async (exam: any) => {
      if (!user || !turma) throw new Error('Not authenticated');
      const { data: existingFolders } = await supabase.from('exam_folders')
        .select('id, name').eq('user_id', user.id);
      const communityFolderName = turma.name || 'Comunidade';
      let examFolder = (existingFolders || []).find((f: any) => f.name === communityFolderName);
      if (!examFolder) {
        const { data: newFolder, error: folderErr } = await supabase.from('exam_folders')
          .insert({ user_id: user.id, name: communityFolderName }).select().single();
        if (folderErr) throw folderErr;
        examFolder = newFolder;
      }

      const { data: questions } = await supabase.from('turma_exam_questions').select('*').eq('exam_id', exam.id).order('sort_order', { ascending: true });
      // Community-imported exams don't need a deck_id
      const deckId = null;
      const totalPoints = (questions ?? []).reduce((sum: number, q: any) => sum + (q.points || 1), 0);
      const { data: newExam, error: examError } = await (supabase.from('exams' as any) as any)
        .insert({
          user_id: user.id, deck_id: deckId, title: exam.title, status: 'pending',
          total_points: totalPoints, time_limit_seconds: exam.time_limit_seconds || null,
          folder_id: examFolder?.id || null,
          source_turma_exam_id: exam.id,
        })
        .select().single();
      if (examError) throw examError;
      const questionsToInsert = (questions ?? []).map((q: any, idx: number) => ({
        exam_id: newExam.id, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer, correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
      return { examId: newExam.id, folderName: communityFolderName, turmaExamId: exam.id };
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam-folders'] });
      queryClient.invalidateQueries({ queryKey: ['user-imported-exams'] });
      toast({ title: '✅ Prova adicionada à coleção!', description: `Na pasta "${result.folderName}".` });
    },
    onError: (err: any) => toast({ title: 'Erro ao importar prova', description: err.message, variant: 'destructive' }),
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
