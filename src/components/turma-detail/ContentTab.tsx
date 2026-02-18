/**
 * ContentTab – unified content view: subject folders + files + decks + exams.
 * No more intermediate "lesson" step – content shows directly.
 */

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from './TurmaDetailContext';
import { useDecks } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Plus, FolderOpen, FolderPlus, ChevronRight, MoreVertical,
  Layers, Pencil, Trash2, Paperclip, Eye, EyeOff,
  Upload, Download, Lock, FileIcon, FileText, Image, Crown, Globe,
  Copy, Link2, ClipboardList, Users, Clock, Import,
  CheckCheck, X, ArrowUpRight, GripVertical,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DeckPreviewSheet from '@/components/community/DeckPreviewSheet';
import PdfCanvasViewer from '@/components/lesson-detail/PdfCanvasViewer';
import { useDragReorder } from '@/hooks/useDragReorder';
import * as turmaService from '@/services/turmaService';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string) => {
  if (type?.startsWith('image/')) return Image;
  if (type?.includes('pdf')) return FileText;
  return FileIcon;
};

const ContentTab = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, turma, subjects, lessons, turmaDecks, turmaExams,
    contentFolderId, setContentFolderId, contentBreadcrumb,
    canEdit, isAdmin, isMod, isSubscriber, user,
    mutations, examMutations, toast, navigate,
    setShowAddSubject, setNewName, setNewDesc,
    setEditingSubject, setEditItemName,
  } = ctx;

  const queryClient = useQueryClient();
  const { decks: userDecks } = useDecks();
  const { folders, createFolder } = useFolders();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Local state ──
  const [uploading, setUploading] = useState(false);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [priceType, setPriceType] = useState<'free' | 'money' | 'credits'>('free');
  const [price, setPrice] = useState('');
  const [allowDownload, setAllowDownload] = useState(false);
  const [editingDeck, setEditingDeck] = useState<any>(null);
  const [editPriceType, setEditPriceType] = useState<'free' | 'money' | 'credits'>('free');
  const [editPrice, setEditPrice] = useState('');
  const [editAllowDownload, setEditAllowDownload] = useState(false);
  const [previewDeck, setPreviewDeck] = useState<any>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewRestricted, setPdfPreviewRestricted] = useState(false);
  const [showImportExam, setShowImportExam] = useState(false);
  const [importingExamId, setImportingExamId] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editFilePriceType, setEditFilePriceType] = useState('free');
  const [confirmResync, setConfirmResync] = useState<any>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [movingItem, setMovingItem] = useState<{ type: string; id: string; name: string } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);

  // ── Data derivation ──
  const currentFolders = subjects.filter((s: any) => s.parent_id === contentFolderId)
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // All lessons for the current subject (used for fetching files)
  const lessonsForSubject = contentFolderId === null
    ? lessons.filter(l => !l.subject_id)
    : lessons.filter(l => l.subject_id === contentFolderId);
  const lessonIdsForSubject = lessonsForSubject.map(l => l.id);

  // Decks at current level (directly shared + via lessons)
  const currentDecks = contentFolderId === null
    ? turmaDecks.filter(d => !d.lesson_id && !d.subject_id)
    : turmaDecks.filter(d =>
        d.subject_id === contentFolderId ||
        (d.lesson_id && lessonIdsForSubject.includes(d.lesson_id))
      );

  // Exams at current level
  const currentExams = contentFolderId === null
    ? turmaExams.filter((e: any) => !e.lesson_id && !e.subject_id)
    : turmaExams.filter((e: any) =>
        e.subject_id === contentFolderId ||
        (e.lesson_id && lessonIdsForSubject.includes(e.lesson_id))
      );

  // Files from lessons in current subject
  const { data: currentFiles = [] } = useQuery({
    queryKey: ['turma-content-files', turmaId, contentFolderId],
    queryFn: async () => {
      const ids = contentFolderId === null
        ? lessons.filter(l => !l.subject_id).map(l => l.id)
        : lessons.filter(l => l.subject_id === contentFolderId).map(l => l.id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from('turma_lesson_files' as any)
        .select('*').in('lesson_id', ids).order('sort_order', { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!turmaId,
  });

  const hasContent = currentFolders.length > 0 || currentFiles.length > 0 || currentDecks.length > 0 || currentExams.length > 0;

  // ── Drag-to-reorder ──
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

  const folderDrag = useDragReorder({
    items: currentFolders,
    getId: (s: any) => s.id,
    onReorder: (reordered) => reorderSubjectsMut.mutate(reordered.map((s: any) => s.id)),
  });
  const fileDrag = useDragReorder({
    items: currentFiles,
    getId: (f: any) => f.id,
    onReorder: (reordered) => reorderFilesMut.mutate(reordered.map((f: any) => f.id)),
  });
  const deckDrag = useDragReorder({
    items: currentDecks,
    getId: (d: any) => d.id,
    onReorder: (reordered) => reorderDecksMut.mutate(reordered.map((d: any) => d.id)),
  });

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

  // ── File mutations ──
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

  const handleSaveFile = () => {
    if (!editingFile) return;
    const nameChanged = editFileName.trim() && editFileName.trim() !== editingFile.file_name;
    const visChanged = editFilePriceType !== (editingFile.price_type || 'free');
    if (nameChanged) renameFileMut.mutate({ fileId: editingFile.id, newName: editFileName.trim() });
    if (visChanged) updateFileVisibility.mutate({ fileId: editingFile.id, pt: editFilePriceType });
    setEditingFile(null);
  };

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

  const resolveNameConflict = (baseName: string, existingNames: string[]): string => {
    if (!existingNames.includes(baseName)) return baseName;
    let suffix = 1;
    let candidate = `${baseName} (cópia)`;
    while (existingNames.includes(candidate)) { suffix++; candidate = `${baseName} (cópia ${suffix})`; }
    return candidate;
  };

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

  const handleAddDeck = () => {
    if (!selectedDeckId) return;
    const finalPrice = priceType === 'free' ? 0 : Number(price) || 0;
    mutations.shareDeck.mutate({ deckId: selectedDeckId, subjectId: contentFolderId, lessonId: undefined, price: finalPrice, priceType, allowDownload } as any, {
      onSuccess: () => { setShowAddDeck(false); setSelectedDeckId(''); setPrice(''); setPriceType('free'); setAllowDownload(false); toast({ title: 'Baralho adicionado!' }); },
      onError: (e: any) => toast({ title: e.message?.includes('duplicate') ? 'Baralho já adicionado' : 'Erro', variant: 'destructive' }),
    });
  };

  const openEditPricing = (td: any) => { setEditingDeck(td); setEditPriceType(td.price_type || 'free'); setEditPrice(td.price ? String(td.price) : ''); setEditAllowDownload(td.allow_download ?? false); };
  const handleEditPricing = () => {
    if (!editingDeck) return;
    const finalPrice = editPriceType === 'free' ? 0 : Number(editPrice) || 0;
    mutations.updateDeckPricing.mutate({ id: editingDeck.id, price: finalPrice, priceType: editPriceType, allowDownload: editAllowDownload }, {
      onSuccess: () => { setEditingDeck(null); toast({ title: 'Configuração atualizada!' }); },
      onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
    });
  };

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

  // Open turma exam (import to personal)
  const handleOpenExam = async (exam: any) => {
    try {
      const { data: existing } = await supabase.from('exams').select('id').eq('user_id', user!.id).eq('source_turma_exam_id', exam.id).limit(1);
      if (existing?.length) { navigate(`/exam/${existing[0].id}`); return; }
      const { data: questions } = await supabase.from('turma_exam_questions').select('*').eq('exam_id', exam.id).order('sort_order', { ascending: true });
      const { data: userDecksList } = await supabase.from('decks').select('id').eq('user_id', user!.id).limit(1);
      let deckId = userDecksList?.[0]?.id;
      if (!deckId) { const { data: newDeck } = await supabase.from('decks').insert({ user_id: user!.id, name: 'Provas Importadas' }).select().single(); deckId = newDeck?.id; }
      if (!deckId) throw new Error('Sem baralho disponível');
      const totalPoints = (questions ?? []).reduce((sum: number, q: any) => sum + (q.points || 1), 0);
      const { data: newExam, error: examError } = await (supabase.from('exams' as any) as any)
        .insert({ user_id: user!.id, deck_id: deckId, title: exam.title, status: 'pending', total_points: totalPoints, time_limit_seconds: exam.time_limit_seconds || null, source_turma_exam_id: exam.id })
        .select().single();
      if (examError) throw examError;
      const questionsToInsert = (questions ?? []).map((q: any, idx: number) => ({
        exam_id: newExam.id, question_type: q.question_type, question_text: q.question_text,
        options: q.options ?? null, correct_answer: q.correct_answer, correct_indices: q.correct_indices || null, points: q.points, sort_order: idx,
      }));
      await (supabase.from('exam_questions' as any) as any).insert(questionsToInsert);
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast({ title: 'Prova importada!' });
      navigate(`/exam/${newExam.id}`);
    } catch (err: any) { toast({ title: 'Erro ao abrir prova', description: err.message, variant: 'destructive' }); }
  };

  // ── Selection / Organize helpers ──
  const toggleItem = (key: string) => {
    setSelectedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };
  const exitSelectionMode = () => { setSelectionMode(false); setSelectedItems(new Set()); };

  const handleBulkDelete = async () => {
    try {
      for (const key of selectedItems) {
        const [type, id] = key.split('::');
        if (type === 'subject') await new Promise<void>((resolve, reject) => mutations.deleteSubject.mutate(id, { onSuccess: () => resolve(), onError: (e) => reject(e) }));
        else if (type === 'file') await new Promise<void>((resolve, reject) => deleteFile.mutate(id, { onSuccess: () => resolve(), onError: (e) => reject(e) }));
        else if (type === 'deck') await new Promise<void>((resolve, reject) => mutations.unshareDeck.mutate(id, { onSuccess: () => resolve(), onError: (e) => reject(e) }));
        else if (type === 'exam') await new Promise<void>((resolve, reject) => examMutations.deleteExam.mutate(id, { onSuccess: () => resolve(), onError: (e) => reject(e) }));
      }
      toast({ title: 'Itens excluídos!' });
    } catch (err: any) {
      toast({ title: 'Erro ao excluir alguns itens', description: err.message, variant: 'destructive' });
    }
    exitSelectionMode();
  };

  // Helper: get all descendant subject IDs to prevent circular moves
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
      setMovingItem(null);
      toast({ title: 'Item movido!' });
    },
    onError: (err: any) => toast({ title: err?.message || 'Erro ao mover', variant: 'destructive' }),
  });

  const handleBulkMove = () => {
    // Use first selected item to open move dialog
    const first = Array.from(selectedItems)[0];
    if (!first) return;
    const [type, id] = first.split('::');
    setMovingItem({ type: 'bulk', id: '', name: `${selectedItems.size} itens` });
    setMoveTargetId(null);
  };

  const confirmMove = () => {
    if (!movingItem) return;
    if (movingItem.type === 'bulk') {
      for (const key of selectedItems) {
        const [type, id] = key.split('::');
        moveItemMut.mutate({ type, id, targetSubjectId: moveTargetId });
      }
      exitSelectionMode();
    } else {
      moveItemMut.mutate({ type: movingItem.type, id: movingItem.id, targetSubjectId: moveTargetId });
    }
  };

  const allSubjectsFlat = subjects.filter((s: any) => s.turma_id === turmaId);

  // ── Render ──
  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      {contentFolderId && (
        <div className="flex items-center gap-1 text-sm mb-1">
          {contentBreadcrumb.map((item, i) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button onClick={() => setContentFolderId(item.id)}
                className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${i === contentBreadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {item.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Title + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {contentFolderId && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const current = subjects.find(s => s.id === contentFolderId);
              setContentFolderId((current as any)?.parent_id ?? null);
            }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasContent && (isAdmin || isMod) && (
            <Button variant={selectionMode ? 'secondary' : 'ghost'} size="sm" className="gap-1.5" onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}>
              {selectionMode ? <X className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
              <span className="hidden sm:inline">{selectionMode ? 'Cancelar' : 'Selecionar'}</span>
            </Button>
          )}
          {!selectionMode && (isAdmin || isMod) && (
            <Button variant="outline" size="sm" onClick={() => { setShowAddSubject(true); setNewName(''); setNewDesc(''); }} className="gap-2">
              <FolderPlus className="h-4 w-4" /><span className="hidden sm:inline">Nova Pasta</span>
            </Button>
          )}
          {!selectionMode && canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /><span className="hidden sm:inline">Adicionar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Anexo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setShowAddDeck(true); setAllowDownload(false); }}>
                  <Copy className="mr-2 h-4 w-4" /> Baralho
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowImportExam(true)}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Prova
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
        </div>
      </div>

      {/* Bulk selection bar */}
      {selectionMode && selectedItems.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium text-foreground mr-auto">{selectedItems.size} selecionado{selectedItems.size > 1 ? 's' : ''}</span>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleBulkMove}>
            <ArrowUpRight className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Mover</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive" onClick={handleBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
          </Button>
        </div>
      )}

      {/* Unified content list */}
      {!hasContent ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-8 text-center px-4">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="font-display text-lg font-bold text-foreground">Nenhum conteúdo ainda</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Crie uma pasta ou adicione conteúdo.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
          {/* Subject folders */}
          {currentFolders.map(subject => {
            const fHandlers = canEdit ? folderDrag.getHandlers(subject) : null;
            const childFolders = subjects.filter((s: any) => s.parent_id === subject.id);
            const childLessons = lessons.filter(l => l.subject_id === subject.id);
            const totalItems = childFolders.length;
            const relatedDecks = turmaDecks.filter(d => d.subject_id === subject.id || (d.lesson_id && childLessons.some(l => l.id === d.lesson_id)));
            const totalCards = relatedDecks.reduce((sum: number, d: any) => sum + (d.card_count ?? 0), 0);
            const childLessonIds = childLessons.map(l => l.id);
            const totalAttachments = (ctx.lessonFiles as any[]).filter(f => childLessonIds.includes(f.lesson_id)).length;
            const relatedExams = turmaExams.filter((e: any) => e.subject_id === subject.id || (e.lesson_id && childLessonIds.includes(e.lesson_id)));
            return (
              <div key={subject.id}
                {...(fHandlers ? { draggable: fHandlers.draggable, onDragStart: fHandlers.onDragStart, onDragOver: fHandlers.onDragOver, onDragEnter: fHandlers.onDragEnter, onDragLeave: fHandlers.onDragLeave, onDrop: fHandlers.onDrop, onDragEnd: fHandlers.onDragEnd } : {})}
                className={`group flex items-center gap-3 px-2 sm:px-5 py-4 cursor-pointer transition-all hover:bg-muted/50 ${fHandlers?.className ?? ''}`}
                onClick={() => selectionMode ? toggleItem(`subject::${subject.id}`) : setContentFolderId(subject.id)}>
                {canEdit && !selectionMode && (
                  <div className="flex h-8 w-6 items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
                    onMouseDown={(e) => e.stopPropagation()}>
                    <GripVertical className="h-4 w-4" />
                  </div>
                )}
                {selectionMode && (
                  <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedItems.has(`subject::${subject.id}`)} onCheckedChange={() => toggleItem(`subject::${subject.id}`)} />
                  </div>
                )}
                <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-card-foreground truncate">{subject.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {totalItems > 0 && <span>{totalItems} pasta{totalItems !== 1 ? 's' : ''}</span>}
                    {totalAttachments > 0 && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {totalAttachments}</span>}
                    {totalCards > 0 && <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {totalCards}</span>}
                    {relatedExams.length > 0 && <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {relatedExams.length}</span>}
                    {totalItems === 0 && totalAttachments === 0 && totalCards === 0 && relatedExams.length === 0 && <span>Vazio</span>}
                  </div>
                </div>
                {!selectionMode && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => { setEditingSubject({ id: subject.id, name: subject.name }); setEditItemName(subject.name); }}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar Nome
                          </DropdownMenuItem>
                        )}
                        {(isAdmin || isMod) && (
                          <DropdownMenuItem onClick={() => { setMovingItem({ type: 'subject', id: subject.id, name: subject.name }); setMoveTargetId(null); }}>
                            <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                          </DropdownMenuItem>
                        )}
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => mutations.deleteSubject.mutate(subject.id, { onSuccess: () => toast({ title: 'Pasta excluída' }), onError: (e: any) => toast({ title: 'Erro ao excluir pasta', description: e.message, variant: 'destructive' }) })}>
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}

          {/* Files */}
          {currentFiles.map((file: any) => {
            const fhFile = canEdit ? fileDrag.getHandlers(file) : null;
            const Icon = getFileIcon(file.file_type);
            const isImage = file.file_type?.startsWith('image/');
            const isPdf = file.file_type?.includes('pdf');
            const canPreview = isImage || isPdf;
            const filePriceType = file.price_type || 'free';
            const fileRestricted = filePriceType !== 'free' && !isSubscriber && !isAdmin && !isMod;
            return (
              <div key={file.id}
                {...(fhFile ? { draggable: fhFile.draggable, onDragStart: fhFile.onDragStart, onDragOver: fhFile.onDragOver, onDragEnter: fhFile.onDragEnter, onDragLeave: fhFile.onDragLeave, onDrop: fhFile.onDrop, onDragEnd: fhFile.onDragEnd } : {})}
                className={`group flex items-center gap-3 px-2 sm:px-5 py-4 transition-all ${fhFile?.className ?? ''}`}
                onClick={() => selectionMode ? toggleItem(`file::${file.id}`) : undefined}>
                {canEdit && !selectionMode && (
                  <div className="flex h-8 w-6 items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
                    onMouseDown={(e) => e.stopPropagation()}>
                    <GripVertical className="h-4 w-4" />
                  </div>
                )}
                {selectionMode && (
                  <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedItems.has(`file::${file.id}`)} onCheckedChange={() => toggleItem(`file::${file.id}`)} />
                  </div>
                )}
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                    {filePriceType !== 'free' && <Crown className="h-3 w-3 shrink-0" style={{ color: 'hsl(270 60% 55%)' }} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-muted-foreground">{formatFileSize(file.file_size)}</p>
                    {fileRestricted && isPdf && <span className="text-[10px] text-warning font-medium">Prévia limitada</span>}
                  </div>
                </div>
                {!selectionMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    {canPreview && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        if (isPdf) { setPdfPreviewUrl(file.file_url); setPdfPreviewRestricted(fileRestricted); }
                        else window.open(file.file_url, '_blank');
                      }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!fileRestricted ? (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                        <a href={file.file_url} download={file.file_name} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" /></a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground/40 cursor-not-allowed" disabled>
                        <Lock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingFile(file); setEditFileName(file.file_name); setEditFilePriceType(file.price_type || 'free'); }}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setMovingItem({ type: 'file', id: file.id, name: file.file_name }); setMoveTargetId(null); }}>
                            <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteFile.mutate(file.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Decks */}
          {currentDecks.map((td: any) => {
            const dhDeck = canEdit ? deckDrag.getHandlers(td) : null;
            const isOwner = td.shared_by === user?.id;
            const alreadyLinked = userHasLinkedDeck(td.id);
            const alreadyOwns = userOwnsDeck(td.deck_id);
            const subscriberOnly = !isDeckFree(td);
            const canImport = canAccessDeck(td);
            const inCollection = alreadyOwns || alreadyLinked;
            const linkedDeck = alreadyLinked ? userDecks.find(d => (d as any).source_turma_deck_id === td.id) : null;
            return (
              <div key={td.id}
                {...(dhDeck ? { draggable: dhDeck.draggable, onDragStart: dhDeck.onDragStart, onDragOver: dhDeck.onDragOver, onDragEnter: dhDeck.onDragEnter, onDragLeave: dhDeck.onDragLeave, onDrop: dhDeck.onDrop, onDragEnd: dhDeck.onDragEnd } : {})}
                className={`group flex items-center gap-3 px-2 sm:px-5 py-4 transition-all hover:bg-muted/50 ${dhDeck?.className ?? ''}`}
                onClick={() => selectionMode ? toggleItem(`deck::${td.id}`) : undefined}>
                {canEdit && !selectionMode && (
                  <div className="flex h-8 w-6 items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
                    onMouseDown={(e) => e.stopPropagation()}>
                    <GripVertical className="h-4 w-4" />
                  </div>
                )}
                {selectionMode && (
                  <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedItems.has(`deck::${td.id}`)} onCheckedChange={() => toggleItem(`deck::${td.id}`)} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground truncate">{td.deck_name}</h3>
                    {subscriberOnly && <Crown className="h-3 w-3 shrink-0" style={{ color: 'hsl(270 60% 55%)' }} />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{td.card_count ?? 0} cards</p>
                </div>
                {!selectionMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewDeck(td)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {!inCollection && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (subscriberOnly && !canImport) return; addToCollection.mutate(td); }}
                        disabled={addToCollection.isPending || (subscriberOnly && !canImport)}>
                        {subscriberOnly && !canImport ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {inCollection && !alreadyOwns && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmResync(td)} disabled={addToCollection.isPending}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {td.allow_download && !inCollection && canImport && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => downloadDeck.mutate(td)} disabled={downloadDeck.isPending}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(isAdmin || isOwner) && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditPricing(td)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setMovingItem({ type: 'deck', id: td.id, name: td.deck_name || 'Baralho' }); setMoveTargetId(null); }}>
                              <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => mutations.unshareDeck.mutate(td.id, { onSuccess: () => toast({ title: 'Baralho removido' }), onError: (e: any) => toast({ title: 'Erro ao remover baralho', description: e.message, variant: 'destructive' }) })}>
                              <Trash2 className="mr-2 h-4 w-4" /> Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Exams */}
          {currentExams.map((exam: any) => (
            <div key={exam.id} className="group flex items-center gap-3 px-2 sm:px-5 py-4 transition-all hover:bg-muted/50"
              onClick={() => selectionMode ? toggleItem(`exam::${exam.id}`) : undefined}>
              {canEdit && !selectionMode && (
                <div className="flex h-8 w-6 items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
                  onMouseDown={(e) => e.stopPropagation()}>
                  <GripVertical className="h-4 w-4" />
                </div>
              )}
              {selectionMode && (
                <div className="shrink-0" onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selectedItems.has(`exam::${exam.id}`)} onCheckedChange={() => toggleItem(`exam::${exam.id}`)} />
                </div>
              )}
              <ClipboardList className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-foreground truncate">{exam.title}</h3>
                  {exam.subscribers_only && <Crown className="h-3 w-3 shrink-0" style={{ color: 'hsl(270 60% 55%)' }} />}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  <span>{exam.total_questions} questões</span>
                  {exam.time_limit_seconds && (
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {Math.round(exam.time_limit_seconds / 60)}min</span>
                  )}
                </div>
              </div>
              {!selectionMode && (
                <div className="flex items-center gap-1 shrink-0">
                  {exam.total_questions > 0 && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleOpenExam(exam)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(isAdmin || exam.created_by === user?.id) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setMovingItem({ type: 'exam', id: exam.id, name: exam.title }); setMoveTargetId(null); }}>
                          <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => examMutations.deleteExam.mutate(exam.id, { onSuccess: () => toast({ title: 'Prova excluída' }), onError: (e: any) => toast({ title: 'Erro ao excluir prova', description: e.message, variant: 'destructive' }) })}>
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Dialogs ── */}

      {/* Add Deck Dialog */}
      <Dialog open={showAddDeck} onOpenChange={setShowAddDeck}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Baralho</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
              <SelectTrigger><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
              <SelectContent>
                {availableDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Visibilidade</p>
              <div className="flex gap-2">
                {([{ value: 'free', label: 'Liberado', icon: Globe }, { value: 'members_only', label: 'Assinantes', icon: Lock }] as const).map(opt => (
                  <Button key={opt.value} variant={priceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setPriceType(opt.value as any)} className="gap-1.5 flex-1">
                    <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div className="space-y-0.5"><Label className="text-sm font-medium">Permitir download</Label><p className="text-xs text-muted-foreground">Cópia independente</p></div>
              <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
            </div>
            <Button className="w-full" disabled={!selectedDeckId || mutations.shareDeck.isPending} onClick={handleAddDeck}>
              {mutations.shareDeck.isPending ? 'Adicionando...' : 'Adicionar Baralho'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Pricing Dialog */}
      <Dialog open={!!editingDeck} onOpenChange={open => !open && setEditingDeck(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Configuração</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Visibilidade</p>
              <div className="flex gap-2">
                {([{ value: 'free', label: 'Liberado', icon: Globe }, { value: 'members_only', label: 'Assinantes', icon: Lock }] as const).map(opt => (
                  <Button key={opt.value} variant={editPriceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setEditPriceType(opt.value as any)} className="gap-1.5 flex-1">
                    <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div className="space-y-0.5"><Label className="text-sm font-medium">Permitir download</Label><p className="text-xs text-muted-foreground">Cópia independente</p></div>
              <Switch checked={editAllowDownload} onCheckedChange={setEditAllowDownload} />
            </div>
            <Button className="w-full" disabled={mutations.updateDeckPricing.isPending} onClick={handleEditPricing}>
              {mutations.updateDeckPricing.isPending ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit File Dialog */}
      {editingFile && (
        <Dialog open={!!editingFile} onOpenChange={open => !open && setEditingFile(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="font-display text-sm">Editar Anexo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input value={editFileName} onChange={e => setEditFileName(e.target.value)} maxLength={200} autoFocus />
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Visibilidade</p>
                <div className="flex gap-2">
                  {([{ value: 'free', label: 'Liberado', icon: Globe }, { value: 'members_only', label: 'Assinantes', icon: Lock }] as const).map(opt => (
                    <Button key={opt.value} variant={editFilePriceType === opt.value ? 'default' : 'outline'} size="sm" onClick={() => setEditFilePriceType(opt.value)} className="gap-1.5 flex-1">
                      <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Button className="w-full" disabled={!editFileName.trim()} onClick={handleSaveFile}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Import Exam Dialog */}
      <Dialog open={showImportExam} onOpenChange={setShowImportExam}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Import className="h-5 w-5 text-primary" /> Importar Prova
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione uma prova pessoal para importar.</p>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2">
            {loadingExams ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : personalExams.length === 0 ? (
              <div className="text-center py-6">
                <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma prova pessoal encontrada.</p>
              </div>
            ) : personalExams.map((exam: any) => {
              const qCount = (personalQuestionCounts as any)[exam.id] || 0;
              return (
                <div key={exam.id} className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-card-foreground truncate">{exam.title}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {qCount > 0 && <span>{qCount} questões</span>}
                      {exam.time_limit_seconds && <span>· {Math.round(exam.time_limit_seconds / 60)}min</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={importingExamId === exam.id} onClick={() => handleImportExamToTurma(exam)} className="gap-1.5 shrink-0">
                    {importingExamId === exam.id ? 'Importando...' : 'Importar'}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deck Preview Sheet */}
      {previewDeck && (
        <DeckPreviewSheet
          open={!!previewDeck} onOpenChange={open => !open && setPreviewDeck(null)}
          deckId={previewDeck.deck_id} deckName={previewDeck.deck_name || 'Baralho'}
          cardCount={previewDeck.card_count ?? 0}
          alreadyLinked={userHasLinkedDeck(previewDeck.id)} alreadyOwns={userOwnsDeck(previewDeck.deck_id)}
          allowDownload={previewDeck.allow_download ?? false}
          onAddToCollection={() => addToCollection.mutate(previewDeck, { onSuccess: () => setPreviewDeck(null) })}
          onDownload={() => downloadDeck.mutate(previewDeck, { onSuccess: () => setPreviewDeck(null) })}
          isAdding={addToCollection.isPending} isDownloading={downloadDeck.isPending}
        />
      )}

      {/* PDF Preview Dialog */}
      <Dialog open={!!pdfPreviewUrl} onOpenChange={open => !open && setPdfPreviewUrl(null)}>
        <DialogContent className="sm:max-w-3xl h-[85vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border/50 shrink-0">
            <DialogTitle className="font-display text-sm">
              Visualizar PDF
              {pdfPreviewRestricted && (
                <span className="ml-2 text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-full" style={{ color: 'hsl(270 60% 55%)' }}>
                  Prévia limitada
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl && <PdfCanvasViewer url={pdfPreviewUrl} restricted={pdfPreviewRestricted} />}
        </DialogContent>
      </Dialog>

      {/* Resync Confirmation Dialog */}
      <Dialog open={!!confirmResync} onOpenChange={open => !open && setConfirmResync(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Atualizar coleção</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este baralho já está na sua coleção. Deseja sincronizar? Cards novos serão adicionados sem perder seu progresso.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmResync(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => { addToCollection.mutate(confirmResync); setConfirmResync(null); }}>Atualizar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={!!movingItem} onOpenChange={open => !open && setMovingItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Mover "{movingItem?.name}"</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Selecione a pasta de destino:</p>
            <Select value={moveTargetId ?? '__root__'} onValueChange={v => setMoveTargetId(v === '__root__' ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar pasta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Raiz (sem pasta)</SelectItem>
                {allSubjectsFlat
                  .filter(s => {
                    if (movingItem?.type === 'subject' && s.id === movingItem?.id) return false;
                    if (movingItem?.type === 'subject' && movingItem?.id) {
                      const descendants = getDescendantIds(movingItem.id);
                      if (descendants.has(s.id)) return false;
                    }
                    return true;
                  })
                  .map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setMovingItem(null)}>Cancelar</Button>
              <Button size="sm" onClick={confirmMove} disabled={moveItemMut.isPending}>
                {moveItemMut.isPending ? 'Movendo...' : 'Mover'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentTab;
