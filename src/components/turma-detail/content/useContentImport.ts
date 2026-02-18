/**
 * useContentImport – deck/exam import logic for the community ContentTab.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from '../TurmaDetailContext';
import { useDecks } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';

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
  const { folders, createFolder } = useFolders();

  const [showImportExam, setShowImportExam] = useState(false);
  const [importingExamId, setImportingExamId] = useState<string | null>(null);
  const [confirmResync, setConfirmResync] = useState<any>(null);

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

  const sharedDeckIds = new Set(turmaDecks.map(d => d.deck_id));
  const availableDecks = userDecks.filter(d => !sharedDeckIds.has(d.id) && !d.is_archived && !(d as any).source_turma_deck_id);

  // ── Add to collection ──
  const addToCollection = useMutation({
    mutationFn: async (td: any) => {
      if (!user || !turma) throw new Error('Not authenticated');
      if (!isDeckFree(td) && !isSubscriber && !isAdmin && !isMod && td.shared_by !== user.id) throw new Error('SUBSCRIBER_ONLY');
      const { data: freshDecks } = await supabase.from('decks').select('*').eq('user_id', user.id);
      const latestDecks = (freshDecks || []) as any[];
      let turmaFolder = folders.find(f => f.name === turma.name && !f.parent_id);
      if (turmaFolder && turmaFolder.is_archived) await supabase.from('folders').update({ is_archived: false } as any).eq('id', turmaFolder.id);
      if (!turmaFolder) {
        const existingFolderNames = folders.filter(f => !f.parent_id).map(f => f.name);
        const folderName = resolveNameConflict(turma.name, existingFolderNames);
        turmaFolder = await createFolder.mutateAsync({ name: folderName }) as any;
      }
      const subjectName = contentFolderId ? subjects.find(s => s.id === contentFolderId)?.name || 'Sem Matéria' : 'Sem Matéria';
      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', td.deck_id).single();
      if (!originalDeck) throw new Error('Deck não encontrado');
      const od = originalDeck as any;

      let parentDeck = latestDecks.find((d: any) => d.name === subjectName && d.folder_id === (turmaFolder as any).id && !d.parent_deck_id);
      let parentDeckId: string | null = null;
      if (!parentDeck) {
        const existingParentNames = latestDecks.filter((d: any) => d.folder_id === (turmaFolder as any).id && !d.parent_deck_id).map((d: any) => d.name);
        const parentName = resolveNameConflict(subjectName, existingParentNames);
        const { data: newParent } = await supabase.from('decks').insert({ name: parentName, user_id: user.id, folder_id: (turmaFolder as any).id } as any).select().single();
        parentDeckId = (newParent as any)?.id ?? null;
      } else { parentDeckId = parentDeck.id; }

      const existingLinked = latestDecks.find((d: any) => d.source_turma_deck_id === td.id);
      if (existingLinked) {
        if (existingLinked.is_archived) await supabase.from('decks').update({ is_archived: false } as any).eq('id', existingLinked.id);
        if (existingLinked.parent_deck_id) {
          const parent = latestDecks.find((d: any) => d.id === existingLinked.parent_deck_id);
          if (parent?.is_archived) await supabase.from('decks').update({ is_archived: false } as any).eq('id', parent.id);
        }
        const { data: sourceCards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', td.deck_id);
        const { data: userCards } = await supabase.from('cards').select('front_content, back_content').eq('deck_id', existingLinked.id);
        const userCardKeys = new Set((userCards || []).map((c: any) => `${c.front_content}|||${c.back_content}`));
        const missingCards = (sourceCards || []).filter((c: any) => !userCardKeys.has(`${c.front_content}|||${c.back_content}`));
        if (missingCards.length > 0) {
          await supabase.from('cards').insert(missingCards.map((c: any) => ({ deck_id: existingLinked.id, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type })) as any);
        }
        if (!existingLinked.source_turma_deck_id) await supabase.from('decks').update({ source_turma_deck_id: td.id } as any).eq('id', existingLinked.id);
        return { synced: true, count: missingCards.length, deckId: existingLinked.id, wasArchived: existingLinked.is_archived };
      }

      const existingChildNames = latestDecks.filter((d: any) => d.parent_deck_id === parentDeckId).map((d: any) => d.name);
      const childName = resolveNameConflict(od.name, existingChildNames);
      const { data: newDeck } = await supabase.from('decks').insert({
        name: childName, user_id: user.id, folder_id: (turmaFolder as any).id,
        parent_deck_id: parentDeckId, algorithm_mode: od.algorithm_mode,
        daily_new_limit: od.daily_new_limit, daily_review_limit: od.daily_review_limit, source_turma_deck_id: td.id,
      } as any).select().single();
      if (newDeck) {
        const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', td.deck_id);
        if (cards?.length) await supabase.from('cards').insert(cards.map((c: any) => ({ deck_id: (newDeck as any).id, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type })) as any);
      }
      return newDeck;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      if (result?.synced) {
        if (result.wasArchived) toast({ title: '✅ Baralho restaurado!', description: result.count > 0 ? `${result.count} cards novos adicionados.` : 'Desarquivado.' });
        else if (result.count > 0) toast({ title: `✅ ${result.count} cards adicionados!` });
        else toast({ title: 'Todos os cards já estão na sua coleção!' });
      } else {
        toast({ title: '✅ Baralho adicionado à sua coleção!', description: `Na pasta "${turma?.name}".` });
      }
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
      let turmaFolder = folders.find(f => f.name === turma.name && !f.parent_id);
      if (!turmaFolder) { turmaFolder = await createFolder.mutateAsync({ name: turma.name }) as any; }
      const { data: originalDeck } = await supabase.from('decks').select('*').eq('id', td.deck_id).single();
      if (!originalDeck) throw new Error('Deck não encontrado');
      const od = originalDeck as any;
      const existingChildNames = latestDecks.filter((d: any) => d.folder_id === (turmaFolder as any).id).map((d: any) => d.name);
      const childName = resolveNameConflict(od.name, existingChildNames);
      const { data: newDeck } = await supabase.from('decks').insert({
        name: childName, user_id: user.id, folder_id: (turmaFolder as any).id,
        algorithm_mode: od.algorithm_mode, daily_new_limit: od.daily_new_limit, daily_review_limit: od.daily_review_limit,
      } as any).select().single();
      if (newDeck) {
        const { data: cards } = await supabase.from('cards').select('front_content, back_content, card_type').eq('deck_id', td.deck_id);
        if (cards?.length) await supabase.from('cards').insert(cards.map((c: any) => ({ deck_id: (newDeck as any).id, front_content: c.front_content, back_content: c.back_content, card_type: c.card_type })) as any);
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

  // ── Exam helpers ──
  const userHasLinkedExam = (turmaExamId: string) => {
    // will be checked dynamically via query
    return false; // placeholder – actual check done in ContentTab via linkedExamsQuery
  };

  // ── Add exam to collection (Copy) ──
  const addExamToCollection = useMutation({
    mutationFn: async (exam: any) => {
      if (!user || !turma) throw new Error('Not authenticated');
      // Find or create exam folder linked to this community
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
      const { data: userDecksList } = await supabase.from('decks').select('id').eq('user_id', user.id).limit(1);
      let deckId = userDecksList?.[0]?.id;
      if (!deckId) { const { data: newDeck } = await supabase.from('decks').insert({ user_id: user.id, name: 'Provas Importadas' }).select().single(); deckId = newDeck?.id; }
      if (!deckId) throw new Error('Sem baralho disponível');
      const totalPoints = (questions ?? []).reduce((sum: number, q: any) => sum + (q.points || 1), 0);
      const { data: newExam, error: examError } = await (supabase.from('exams' as any) as any)
        .insert({
          user_id: user.id, deck_id: deckId, title: exam.title, status: 'pending',
          total_points: totalPoints, time_limit_seconds: exam.time_limit_seconds || null,
          source_turma_exam_id: exam.id, folder_id: examFolder?.id || null,
          synced_at: new Date().toISOString(),
        })
        .select().single();
      if (examError) throw examError;
      const questionsToInsert = (questions ?? []).map((q: any, idx: number) => ({
        exam_id: newExam.id, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer, correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
      return { examId: newExam.id, folderName: communityFolderName };
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exam-folders'] });
      queryClient.invalidateQueries({ queryKey: ['linked-exams'] });
      toast({ title: '✅ Prova adicionada à coleção!', description: `Na pasta "${result.folderName}".` });
    },
    onError: (err: any) => toast({ title: 'Erro ao importar prova', description: err.message, variant: 'destructive' }),
  });

  // ── Compute sync changes for an exam ──
  const computeExamSyncChanges = async (turmaExamId: string, localExamId: string) => {
    const { data: sourceQuestions } = await supabase.from('turma_exam_questions').select('*').eq('exam_id', turmaExamId).order('sort_order', { ascending: true });
    const { data: localQuestions } = await supabase.from('exam_questions').select('*').eq('exam_id', localExamId).order('sort_order', { ascending: true });

    const source = (sourceQuestions ?? []) as any[];
    const local = (localQuestions ?? []) as any[];
    const changes: any[] = [];

    // Match by question_text
    const localMap = new Map<string, any>();
    local.forEach(q => localMap.set(q.question_text, q));

    const sourceTexts = new Set<string>();
    for (const sq of source) {
      sourceTexts.add(sq.question_text);
      const lq = localMap.get(sq.question_text);
      if (!lq) {
        changes.push({ type: 'added', questionText: sq.question_text, sourceData: sq });
      } else {
        // Check if modified (options or correct_answer changed)
        const optionsChanged = JSON.stringify(sq.options) !== JSON.stringify(lq.options);
        const answerChanged = sq.correct_answer !== lq.correct_answer;
        if (optionsChanged || answerChanged) {
          changes.push({ type: 'modified', questionText: lq.question_text, newText: sq.question_text, sourceData: sq, localId: lq.id });
        }
      }
    }

    // Removed: questions in local that came from source but no longer exist
    for (const lq of local) {
      if (!sourceTexts.has(lq.question_text) && !lq.card_id) {
        changes.push({ type: 'removed', questionText: lq.question_text, localId: lq.id });
      }
    }

    return changes;
  };

  // ── Apply sync changes ──
  const applySyncChanges = async (localExamId: string, selectedChanges: any[]) => {
    for (const change of selectedChanges) {
      if (change.type === 'added' && change.sourceData) {
        const { data: localQs } = await supabase.from('exam_questions').select('sort_order').eq('exam_id', localExamId).order('sort_order', { ascending: false }).limit(1);
        const nextOrder = ((localQs as any)?.[0]?.sort_order ?? -1) + 1;
        await (supabase.from('exam_questions' as any) as any).insert({
          exam_id: localExamId, question_type: change.sourceData.question_type, question_text: change.sourceData.question_text,
          options: change.sourceData.options ?? null, correct_answer: change.sourceData.correct_answer,
          correct_indices: change.sourceData.correct_indices || null, points: change.sourceData.points, sort_order: nextOrder,
        });
      } else if (change.type === 'removed' && change.localId) {
        await supabase.from('exam_questions').delete().eq('id', change.localId);
      } else if (change.type === 'modified' && change.localId && change.sourceData) {
        await (supabase.from('exam_questions' as any) as any).update({
          question_text: change.sourceData.question_text,
          options: change.sourceData.options ?? null,
          correct_answer: change.sourceData.correct_answer,
          correct_indices: change.sourceData.correct_indices || null,
          points: change.sourceData.points,
        }).eq('id', change.localId);
      }
    }
    // Update synced_at
    await (supabase.from('exams' as any) as any).update({ synced_at: new Date().toISOString() }).eq('id', localExamId);
    queryClient.invalidateQueries({ queryKey: ['exams'] });
    queryClient.invalidateQueries({ queryKey: ['exam-questions'] });
    queryClient.invalidateQueries({ queryKey: ['linked-exams'] });
  };

  // ── Sync review state ──
  const [syncReviewExam, setSyncReviewExam] = useState<{ turmaExamId: string; localExamId: string; title: string } | null>(null);
  const [syncChanges, setSyncChanges] = useState<any[]>([]);
  const [loadingSyncChanges, setLoadingSyncChanges] = useState(false);

  const openSyncReview = async (turmaExamId: string, localExamId: string, title: string) => {
    setLoadingSyncChanges(true);
    setSyncReviewExam({ turmaExamId, localExamId, title });
    try {
      const changes = await computeExamSyncChanges(turmaExamId, localExamId);
      setSyncChanges(changes);
    } catch (err) {
      toast({ title: 'Erro ao comparar', variant: 'destructive' });
      setSyncReviewExam(null);
    } finally {
      setLoadingSyncChanges(false);
    }
  };

  return {
    userOwnsDeck,
    userHasLinkedDeck,
    isDeckFree,
    canAccessDeck,
    availableDecks,
    addToCollection,
    downloadDeck,
    confirmResync,
    setConfirmResync,
    showImportExam,
    setShowImportExam,
    importingExamId,
    personalExams,
    loadingExams,
    personalQuestionCounts,
    handleImportExamToTurma,
    // Exam copy/sync
    addExamToCollection,
    syncReviewExam,
    setSyncReviewExam,
    syncChanges,
    loadingSyncChanges,
    openSyncReview,
    applySyncChanges,
  };
};
