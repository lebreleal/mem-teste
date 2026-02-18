/**
 * useContentMutations – all content-level mutations for the community ContentTab.
 */

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from '../TurmaDetailContext';
import * as turmaService from '@/services/turmaService';
import { useDragReorder } from '@/hooks/useDragReorder';

export const useContentMutations = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, subjects, lessons, contentFolderId, user,
    mutations, examMutations, toast,
  } = ctx;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── Auto-create default lesson for file uploads ──
  const getOrCreateDefaultLesson = async (): Promise<string> => {
    const existing = contentFolderId === null
      ? lessons.find(l => !l.subject_id)
      : lessons.find(l => l.subject_id === contentFolderId);
    if (existing) return existing.id;
    const name = contentFolderId
      ? subjects.find(s => s.id === contentFolderId)?.name || 'Conteúdo'
      : 'Geral';
    const { data, error } = await supabase.from('turma_lessons' as any).insert({
      turma_id: turmaId, subject_id: contentFolderId, name, created_by: user!.id, is_published: true,
    } as any).select().single();
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['turma-lessons', turmaId] });
    return (data as any).id;
  };

  // ── File upload ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length || !user || !turmaId) return;
    setUploading(true);
    try {
      const lessonId = await getOrCreateDefaultLesson();
      for (const file of Array.from(fileList)) {
        if (file.size > 20 * 1024 * 1024) {
          toast({ title: 'Arquivo muito grande', description: 'Máximo 20MB.', variant: 'destructive' });
          continue;
        }
        const filePath = `${user.id}/${turmaId}/${lessonId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('lesson-files').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('lesson-files').getPublicUrl(filePath);
        await supabase.from('turma_lesson_files' as any).insert({
          lesson_id: lessonId, turma_id: turmaId, file_name: file.name,
          file_url: urlData.publicUrl, file_size: file.size, file_type: file.type, uploaded_by: user.id,
        } as any);
      }
      queryClient.invalidateQueries({ queryKey: ['turma-content-files'] });
      toast({ title: 'Arquivo(s) enviado(s)!' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteFile = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase.from('turma_lesson_files' as any).delete().eq('id', fileId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }); toast({ title: 'Arquivo removido' }); },
    onError: (err: any) => toast({ title: 'Erro ao remover arquivo', description: err.message, variant: 'destructive' }),
  });

  const updateFileVisibility = useMutation({
    mutationFn: async ({ fileId, pt }: { fileId: string; pt: string }) => {
      const { error } = await supabase.from('turma_lesson_files' as any).update({ price_type: pt } as any).eq('id', fileId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }); toast({ title: 'Visibilidade atualizada!' }); },
    onError: (err: any) => toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' }),
  });

  const renameFileMut = useMutation({
    mutationFn: async ({ fileId, newName }: { fileId: string; newName: string }) => {
      const { error } = await supabase.from('turma_lesson_files' as any).update({ file_name: newName } as any).eq('id', fileId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }); toast({ title: 'Nome atualizado!' }); },
    onError: (err: any) => toast({ title: 'Erro ao renomear', description: err.message, variant: 'destructive' }),
  });

  // ── Move item ──
  const getDescendantIds = (parentId: string): Set<string> => {
    const result = new Set<string>();
    const children = subjects.filter((s: any) => s.parent_id === parentId);
    for (const child of children) {
      result.add(child.id);
      for (const desc of getDescendantIds(child.id)) result.add(desc);
    }
    return result;
  };

  const moveItemMut = useMutation({
    mutationFn: async ({ type, id, targetSubjectId }: { type: string; id: string; targetSubjectId: string | null }) => {
      if (type === 'subject') {
        if (targetSubjectId === id) throw new Error('Não é possível mover para si mesmo');
        const descendants = getDescendantIds(id);
        if (targetSubjectId && descendants.has(targetSubjectId)) throw new Error('Não é possível mover para uma subpasta');
        const { error } = await supabase.from('turma_subjects' as any).update({ parent_id: targetSubjectId } as any).eq('id', id);
        if (error) throw error;
      } else if (type === 'deck') {
        const { error } = await supabase.from('turma_decks' as any).update({ subject_id: targetSubjectId } as any).eq('id', id);
        if (error) throw error;
      } else if (type === 'exam') {
        const { error } = await supabase.from('turma_exams' as any).update({ subject_id: targetSubjectId } as any).eq('id', id);
        if (error) throw error;
      } else if (type === 'file') {
        const targetLessons = targetSubjectId === null
          ? lessons.filter(l => !l.subject_id)
          : lessons.filter(l => l.subject_id === targetSubjectId);
        let lessonId = targetLessons[0]?.id;
        if (!lessonId) {
          const name = targetSubjectId ? subjects.find(s => s.id === targetSubjectId)?.name || 'Conteúdo' : 'Geral';
          const { data, error } = await supabase.from('turma_lessons' as any).insert({
            turma_id: turmaId, subject_id: targetSubjectId, name, created_by: user!.id, is_published: true,
          } as any).select().single();
          if (error) throw error;
          lessonId = (data as any)?.id;
        }
        if (lessonId) {
          const { error } = await supabase.from('turma_lesson_files' as any).update({ lesson_id: lessonId } as any).eq('id', id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turma-subjects', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turma-decks', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['turma-content-files'] });
      queryClient.invalidateQueries({ queryKey: ['turma-lessons', turmaId] });
      toast({ title: 'Item movido!' });
    },
    onError: (err: any) => toast({ title: err?.message || 'Erro ao mover', variant: 'destructive' }),
  });

  // ── Reorder mutations ──
  const reorderSubjectsMut = useMutation({
    mutationFn: (ids: string[]) => turmaService.reorderSubjects(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-subjects', turmaId] }),
  });
  const reorderFilesMut = useMutation({
    mutationFn: (ids: string[]) => turmaService.reorderTurmaFiles(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }),
  });
  const reorderDecksMut = useMutation({
    mutationFn: (ids: string[]) => turmaService.reorderTurmaDecks(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-decks', turmaId] }),
  });
  const reorderExamsMut = useMutation({
    mutationFn: (ids: string[]) => turmaService.reorderTurmaExams(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] }),
  });

  // ── Bulk operations ──
  const handleBulkDelete = async (selectedItems: Set<string>, exitSelectionMode: () => void) => {
    try {
      for (const key of selectedItems) {
        const [type, id] = key.split('::');
        if (type === 'subject') await new Promise<void>((resolve, reject) => mutations.deleteSubject.mutate(id, { onSuccess: () => resolve(), onError: (e: any) => reject(e) }));
        else if (type === 'file') await new Promise<void>((resolve, reject) => deleteFile.mutate(id, { onSuccess: () => resolve(), onError: (e: any) => reject(e) }));
        else if (type === 'deck') await new Promise<void>((resolve, reject) => mutations.unshareDeck.mutate(id, { onSuccess: () => resolve(), onError: (e: any) => reject(e) }));
        else if (type === 'exam') await new Promise<void>((resolve, reject) => examMutations.deleteExam.mutate(id, { onSuccess: () => resolve(), onError: (e: any) => reject(e) }));
      }
      toast({ title: 'Itens excluídos!' });
    } catch (err: any) {
      toast({ title: 'Erro ao excluir alguns itens', description: err.message, variant: 'destructive' });
    }
    exitSelectionMode();
  };

  return {
    fileInputRef,
    uploading,
    handleFileUpload,
    deleteFile,
    updateFileVisibility,
    renameFileMut,
    moveItemMut,
    getDescendantIds,
    reorderSubjectsMut,
    reorderFilesMut,
    reorderDecksMut,
    reorderExamsMut,
    handleBulkDelete,
  };
};
