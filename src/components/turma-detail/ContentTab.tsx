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
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DeckPreviewSheet from '@/components/community/DeckPreviewSheet';
import PdfCanvasViewer from '@/components/lesson-detail/PdfCanvasViewer';

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

  // ── Data derivation ──
  const currentFolders = subjects.filter((s: any) => s.parent_id === contentFolderId);

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
        .select('*').in('lesson_id', ids).order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: !!turmaId,
  });

  const hasContent = currentFolders.length > 0 || currentFiles.length > 0 || currentDecks.length > 0 || currentExams.length > 0;

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
      await supabase.from('turma_lesson_files' as any).delete().eq('id', fileId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }); toast({ title: 'Arquivo removido' }); },
  });

  const updateFileVisibility = useMutation({
    mutationFn: async ({ fileId, pt }: { fileId: string; pt: string }) => {
      await supabase.from('turma_lesson_files' as any).update({ price_type: pt } as any).eq('id', fileId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }); toast({ title: 'Visibilidade atualizada!' }); },
  });

  const renameFileMut = useMutation({
    mutationFn: async ({ fileId, newName }: { fileId: string; newName: string }) => {
      await supabase.from('turma_lesson_files' as any).update({ file_name: newName } as any).eq('id', fileId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['turma-content-files'] }); toast({ title: 'Nome atualizado!' }); },
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
  const availableDecks = userDecks.filter(d => !sharedDeckIds.has(d.id) && !d.is_archived);

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
          {contentFolderId && (
            <h2 className="font-display text-lg font-bold text-foreground truncate">
              {contentBreadcrumb[contentBreadcrumb.length - 1]?.name}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(isAdmin || isMod) && (
            <Button variant="outline" size="sm" onClick={() => { setShowAddSubject(true); setNewName(''); setNewDesc(''); }} className="gap-2">
              <FolderPlus className="h-4 w-4" /><span className="hidden sm:inline">Nova Pasta</span>
            </Button>
          )}
          {canEdit && (
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
            const childFolders = subjects.filter((s: any) => s.parent_id === subject.id);
            const childLessons = lessons.filter(l => l.subject_id === subject.id);
            const totalItems = childFolders.length;
            const relatedDecks = turmaDecks.filter(d => d.subject_id === subject.id || (d.lesson_id && childLessons.some(l => l.id === d.lesson_id)));
            const totalCards = relatedDecks.reduce((sum: number, d: any) => sum + (d.card_count ?? 0), 0);
            const childLessonIds = childLessons.map(l => l.id);
            const totalAttachments = (ctx.lessonFiles as any[]).filter(f => childLessonIds.includes(f.lesson_id)).length;
            const relatedExams = turmaExams.filter((e: any) => e.subject_id === subject.id || (e.lesson_id && childLessonIds.includes(e.lesson_id)));
            return (
              <div key={subject.id} className="group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => setContentFolderId(subject.id)}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
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
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => mutations.deleteSubject.mutate(subject.id, { onSuccess: () => toast({ title: 'Pasta excluída' }) })}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}

          {/* Files */}
          {currentFiles.map((file: any) => {
            const Icon = getFileIcon(file.file_type);
            const isImage = file.file_type?.startsWith('image/');
            const isPdf = file.file_type?.includes('pdf');
            const canPreview = isImage || isPdf;
            const filePriceType = file.price_type || 'free';
            const fileRestricted = filePriceType !== 'free' && !isSubscriber && !isAdmin && !isMod;
            return (
              <div key={file.id} className="group flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
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
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteFile.mutate(file.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {/* Decks */}
          {currentDecks.map((td: any) => {
            const isOwner = td.shared_by === user?.id;
            const alreadyLinked = userHasLinkedDeck(td.id);
            const alreadyOwns = userOwnsDeck(td.deck_id);
            const subscriberOnly = !isDeckFree(td);
            const canImport = canAccessDeck(td);
            const inCollection = alreadyOwns || alreadyLinked;
            const linkedDeck = alreadyLinked ? userDecks.find(d => (d as any).source_turma_deck_id === td.id) : null;
            return (
              <div key={td.id} className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground truncate">{td.deck_name}</h3>
                    {subscriberOnly && <Crown className="h-3 w-3 shrink-0" style={{ color: 'hsl(270 60% 55%)' }} />}
                    {inCollection && (
                      <button
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-info bg-info/10 px-1.5 py-0.5 rounded-full shrink-0 hover:bg-info/20 transition-colors"
                        onClick={e => { e.stopPropagation(); navigate(`/decks/${linkedDeck?.id || td.deck_id}`); }}
                      >
                        <Link2 className="h-2.5 w-2.5" /> Na coleção
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{td.card_count ?? 0} cards</p>
                </div>
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
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => addToCollection.mutate(td)} disabled={addToCollection.isPending}>
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
                          <DropdownMenuItem className="text-destructive" onClick={() => mutations.unshareDeck.mutate(td.id, { onSuccess: () => toast({ title: 'Baralho removido' }) })}>
                            <Trash2 className="mr-2 h-4 w-4" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Exams */}
          {currentExams.map((exam: any) => (
            <div key={exam.id} className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ClipboardList className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <h3 className="text-sm font-semibold text-foreground truncate">{exam.title}</h3>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  <span>{exam.total_questions} questões</span>
                  {exam.time_limit_seconds && (
                    <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {Math.round(exam.time_limit_seconds / 60)}min</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {exam.total_questions > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => handleOpenExam(exam)}>
                    <Eye className="h-3.5 w-3.5" /> Abrir
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
                      <DropdownMenuItem className="text-destructive" onClick={() => examMutations.deleteExam.mutate(exam.id, { onSuccess: () => toast({ title: 'Prova excluída' }) })}>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
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
    </div>
  );
};

export default ContentTab;
