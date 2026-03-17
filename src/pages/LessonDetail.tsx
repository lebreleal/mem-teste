/**
 * Lesson detail page – orchestrates sub-components.
 */

import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTurmas } from '@/hooks/useTurmas';
import {
  useTurmaRole, useTurmaMembers, useTurmaSubjects, useTurmaLessons,
  useTurmaDecks, useTurmaHierarchyMutations,
} from '@/hooks/useTurmaHierarchy';
import { useDecks } from '@/hooks/useDecks';
import { useFolders } from '@/hooks/useFolders';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTurmaExams, useTurmaExamMutations } from '@/hooks/useTurmaExams';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import LessonContent from '@/components/lesson-detail/LessonContent';
import LessonDialogs from '@/components/lesson-detail/LessonDialogs';

import {
  fetchLessonFiles,
  uploadLessonFile,
  deleteLessonFile,
  renameLessonFile,
  updateLessonFileVisibility,
  fetchLessonContentFolders,
  createLessonContentFolder,
  renameLessonContentFolder,
  deleteLessonContentFolder,
  moveLessonItem,
  fetchPublicProfiles,
  fetchUserDecksForSync,
  fetchOriginalDeckInfo,
  createDeckWithSource,
  fetchCardsForCopy,
  insertCardCopies,
  unarchiveDeck,
  linkDeckToTurmaSource,
  unarchiveFolder,
  importExamToTurma,
  importTurmaExamToPersonal,
} from '@/services/turmaLessonService';

const LessonDetail = () => {
  const { turmaId, lessonId } = useParams<{ turmaId: string; lessonId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { turmas } = useTurmas();
  const turma = turmas.find(t => t.id === turmaId);
  const queryClient = useQueryClient();
  const { folders, createFolder } = useFolders();

  const { data: myRole } = useTurmaRole(turmaId!);
  const { data: subjects = [] } = useTurmaSubjects(turmaId!);
  const { data: lessons = [] } = useTurmaLessons(turmaId!);
  const { data: turmaDecks = [] } = useTurmaDecks(turmaId!);
  const { decks: userDecks } = useDecks();
  const mutations = useTurmaHierarchyMutations(turmaId!);
  const { data: turmaExams = [] } = useTurmaExams(turmaId!);
  const examMutations = useTurmaExamMutations(turmaId!);

  const lesson = lessons.find(l => l.id === lessonId);
  const subject = subjects.find(s => s.id === lesson?.subject_id);
  const lessonDecks = turmaDecks.filter(d => d.lesson_id === lessonId);
  const lessonExams = turmaExams.filter((e: any) => e.lesson_id === lessonId);

  const isAdmin = myRole === 'admin';
  const isMod = myRole === 'moderator';
  const canEdit = isAdmin || isMod;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch lesson files
  const { data: lessonFiles = [] } = useQuery({
    queryKey: ['lesson-files', lessonId],
    queryFn: () => fetchLessonFiles(lessonId!),
    enabled: !!lessonId,
  });

  // Fetch content folders
  const { data: contentFolders = [] } = useQuery({
    queryKey: ['lesson-content-folders', lessonId],
    queryFn: () => fetchLessonContentFolders(lessonId!),
    enabled: !!lessonId,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length || !user || !turmaId || !lessonId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast({ title: 'Arquivo muito grande', description: 'Máximo 20MB por arquivo.', variant: 'destructive' });
          continue;
        }
        await uploadLessonFile({ file, userId: user.id, turmaId, lessonId });
      }
      queryClient.invalidateQueries({ queryKey: ['lesson-files', lessonId] });
      toast({ title: 'Arquivo(s) enviado(s)!' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar arquivo', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteFileMutation = useMutation({
    mutationFn: deleteLessonFile,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lesson-files', lessonId] }); toast({ title: 'Arquivo removido' }); },
  });

  const renameFileMutation = useMutation({
    mutationFn: ({ fileId, newName }: { fileId: string; newName: string }) => renameLessonFile(fileId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-files', lessonId] });
      toast({ title: 'Nome atualizado!' });
    },
  });

  const updateFileVisibilityMutation = useMutation({
    mutationFn: ({ fileId, priceType }: { fileId: string; priceType: string }) => updateLessonFileVisibility(fileId, priceType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-files', lessonId] });
      toast({ title: 'Visibilidade atualizada!' });
    },
  });

  // Content folder mutations
  const createContentFolderMutation = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) => {
      if (!user || !turmaId || !lessonId) throw new Error('Missing context');
      return createLessonContentFolder({ lessonId, turmaId, name, parentId, createdBy: user.id });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lesson-content-folders', lessonId] }); toast({ title: 'Pasta criada!' }); },
    onError: () => toast({ title: 'Erro ao criar pasta', variant: 'destructive' }),
  });

  const renameContentFolderMutation = useMutation({
    mutationFn: ({ folderId, newName }: { folderId: string; newName: string }) => renameLessonContentFolder(folderId, newName),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lesson-content-folders', lessonId] }); toast({ title: 'Pasta renomeada!' }); },
  });

  const deleteContentFolderMutation = useMutation({
    mutationFn: deleteLessonContentFolder,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lesson-content-folders', lessonId] }); toast({ title: 'Pasta removida!' }); },
  });

  const moveItemMutation = useMutation({
    mutationFn: ({ itemType, itemId, targetFolderId }: { itemType: 'file' | 'deck'; itemId: string; targetFolderId: string | null }) =>
      moveLessonItem({ itemType, itemId, targetFolderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson-files', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['turma-decks', turmaId] });
      toast({ title: 'Item movido!' });
    },
  });

  // Import personal exam into turma
  const handleImportExamToTurma = async (exam: any) => {
    if (!user || !turmaId || !lessonId) return;
    await importExamToTurma({
      examId: exam.id,
      turmaId,
      userId: user.id,
      lessonId,
      subjectId: lesson?.subject_id || null,
      title: exam.title || 'Prova Importada',
      timeLimitSeconds: exam.time_limit_seconds || null,
    });
    queryClient.invalidateQueries({ queryKey: ['turma-exams', turmaId] });
    toast({ title: 'Prova importada!' });
  };

  // Open exam (import to personal and navigate)
  const handleOpenExam = async (exam: any) => {
    try {
      const { fetchLinkedExam } = await import('@/services/examService');
      const existing = await fetchLinkedExam(user!.id, exam.id);
      if (existing) { navigate(`/exam/${existing.id}`); return; }

      const newExamId = await importTurmaExamToPersonal({
        examId: exam.id,
        userId: user!.id,
        title: exam.title,
        timeLimitSeconds: exam.time_limit_seconds || null,
      });
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast({ title: 'Prova importada!' });
      navigate(`/exam/${newExamId}`);
    } catch (err: any) { toast({ title: 'Erro ao abrir prova', description: err.message, variant: 'destructive' }); }
  };

  const sharerIds = [...new Set(lessonDecks.map(d => d.shared_by))];
  const { data: sharerProfiles = [] } = useQuery({
    queryKey: ['sharer-profiles', ...sharerIds],
    queryFn: () => fetchPublicProfiles(sharerIds),
    enabled: sharerIds.length > 0,
  });

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

  const { data: members = [] } = useTurmaMembers(turmaId!);
  const currentMember = members.find(m => m.user_id === user?.id);
  const isSubscriber = currentMember?.is_subscriber ?? false;

  const sharedDeckIds = new Set(turmaDecks.map(d => d.deck_id));
  const availableDecks = userDecks.filter(d => !sharedDeckIds.has(d.id) && !d.is_archived);

  // Helper: resolve name conflicts
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
      const isDeckFreeCheck = !td.price_type || td.price_type === 'free';
      if (!isDeckFreeCheck && !isSubscriber && !isAdmin && !isMod && td.shared_by !== user.id) {
        throw new Error('SUBSCRIBER_ONLY');
      }
      const latestDecks = await fetchUserDecksForSync(user.id);

      let turmaFolder = folders.find(f => f.name === turma.name && !f.parent_id);
      if (turmaFolder && turmaFolder.is_archived) {
        await unarchiveFolder(turmaFolder.id);
      }
      if (!turmaFolder) {
        const existingFolderNames = folders.filter(f => !f.parent_id).map(f => f.name);
        const folderName = resolveNameConflict(turma.name, existingFolderNames);
        const result = await createFolder.mutateAsync({ name: folderName });
        turmaFolder = result as any;
      }

      const od = await fetchOriginalDeckInfo(td.deck_id);
      const subjectName = subject?.name || 'Sem Matéria';

      let parentDeck = latestDecks.find((d) => d.name === subjectName && d.folder_id === (turmaFolder as any).id && !d.parent_deck_id);
      let parentDeckId: string | null = null;
      if (!parentDeck) {
        const existingParentNames = latestDecks.filter((d) => d.folder_id === (turmaFolder as any).id && !d.parent_deck_id).map((d) => d.name);
        const parentName = resolveNameConflict(subjectName, existingParentNames);
        const newParent = await createDeckWithSource({ name: parentName, userId: user.id, folderId: (turmaFolder as any).id, parentDeckId: null });
        parentDeckId = newParent.id;
      } else { parentDeckId = parentDeck.id; }

      const lessonLabel = lesson?.lesson_date ? `${format(new Date(lesson.lesson_date + 'T00:00:00'), 'dd/MM', { locale: ptBR })} - ${lesson.name}` : lesson?.name || od.name;

      const existingLinked = latestDecks.find((d) => d.source_turma_deck_id === td.id);
      if (existingLinked) {
        if (existingLinked.is_archived) {
          await unarchiveDeck(existingLinked.id);
        }
        if (existingLinked.parent_deck_id) {
          const parent = latestDecks.find((d) => d.id === existingLinked.parent_deck_id);
          if (parent?.is_archived) {
            await unarchiveDeck(parent.id);
          }
        }
        if (turmaFolder && (turmaFolder as any).is_archived) {
          await unarchiveFolder((turmaFolder as any).id);
        }
        const sourceCards = await fetchCardsForCopy(td.deck_id);
        const userCards = await fetchCardsForCopy(existingLinked.id);
        const userCardKeys = new Set(userCards.map(c => `${c.front_content}|||${c.back_content}`));
        const missingCards = sourceCards.filter(c => !userCardKeys.has(`${c.front_content}|||${c.back_content}`));
        if (missingCards.length > 0) {
          await insertCardCopies(existingLinked.id, missingCards);
        }
        if (!existingLinked.source_turma_deck_id) {
          await linkDeckToTurmaSource(existingLinked.id, td.id);
        }
        return { synced: true, count: missingCards.length, deckId: existingLinked.id, wasArchived: existingLinked.is_archived };
      }

      const existingChildNames = latestDecks.filter((d) => d.parent_deck_id === parentDeckId).map((d) => d.name);
      const childName = resolveNameConflict(lessonLabel, existingChildNames);

      const newDeck = await createDeckWithSource({
        name: childName, userId: user.id, folderId: (turmaFolder as any).id,
        parentDeckId, algorithmMode: od.algorithm_mode,
        dailyNewLimit: od.daily_new_limit, dailyReviewLimit: od.daily_review_limit, sourceTurmaDeckId: td.id,
      });
      const cards = await fetchCardsForCopy(td.deck_id);
      if (cards.length > 0) {
        await insertCardCopies(newDeck.id, cards);
      }
      return newDeck;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      if (result?.synced) {
        if (result.wasArchived) {
          toast({ title: '✅ Baralho restaurado!', description: result.count > 0 ? `Desarquivado e ${result.count} card${result.count > 1 ? 's' : ''} novo${result.count > 1 ? 's' : ''} adicionado${result.count > 1 ? 's' : ''}.` : 'Desarquivado. Seu progresso de estudo foi mantido.' });
        } else if (result.count > 0) {
          toast({ title: `✅ ${result.count} card${result.count > 1 ? 's' : ''} adicionado${result.count > 1 ? 's' : ''}!`, description: 'Cards que faltavam foram importados.' });
        } else {
          toast({ title: 'Todos os cards já estão na sua coleção!' });
        }
      } else {
        toast({ title: '✅ Baralho adicionado à sua coleção!', description: `Ele está na pasta "${turma?.name}" no seu menu Início.` });
      }
    },
    onError: (err: any) => {
      if (err?.message === 'SUBSCRIBER_ONLY') {
        toast({ title: 'Conteúdo exclusivo para assinantes', description: 'Assine esta comunidade para acessar este baralho.', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao adicionar baralho', variant: 'destructive' });
      }
    },
  });

  const downloadDeck = useMutation({
    mutationFn: async (td: any) => {
      if (!user || !turma) throw new Error('Not authenticated');
      const latestDecks = await fetchUserDecksForSync(user.id);

      let turmaFolder = folders.find(f => f.name === turma.name && !f.parent_id);
      if (!turmaFolder) {
        const existingFolderNames = folders.filter(f => !f.parent_id).map(f => f.name);
        const folderName = resolveNameConflict(turma.name, existingFolderNames);
        const result = await createFolder.mutateAsync({ name: folderName });
        turmaFolder = result as any;
      }
      const od = await fetchOriginalDeckInfo(td.deck_id);
      const subjectName = subject?.name || 'Sem Matéria';
      let parentDeck = latestDecks.find((d) => d.name === subjectName && d.folder_id === (turmaFolder as any).id && !d.parent_deck_id);
      let parentDeckId: string | null = null;
      if (!parentDeck) {
        const existingParentNames = latestDecks.filter((d) => d.folder_id === (turmaFolder as any).id && !d.parent_deck_id).map((d) => d.name);
        const parentName = resolveNameConflict(subjectName, existingParentNames);
        const newParent = await createDeckWithSource({ name: parentName, userId: user.id, folderId: (turmaFolder as any).id, parentDeckId: null });
        parentDeckId = newParent.id;
      } else { parentDeckId = parentDeck.id; }
      const lessonLabel = lesson?.lesson_date ? `${format(new Date(lesson.lesson_date + 'T00:00:00'), 'dd/MM', { locale: ptBR })} - ${lesson.name}` : lesson?.name || od.name;
      const existingChildNames = latestDecks.filter((d) => d.parent_deck_id === parentDeckId).map((d) => d.name);
      const childName = resolveNameConflict(lessonLabel, existingChildNames);
      const newDeck = await createDeckWithSource({
        name: childName, userId: user.id, folderId: (turmaFolder as any).id,
        parentDeckId, algorithmMode: od.algorithm_mode,
        dailyNewLimit: od.daily_new_limit, dailyReviewLimit: od.daily_review_limit,
      });
      const cards = await fetchCardsForCopy(td.deck_id);
      if (cards.length > 0) {
        await insertCardCopies(newDeck.id, cards);
      }
      return newDeck;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['decks'] }); queryClient.invalidateQueries({ queryKey: ['folders'] }); toast({ title: 'Baralho baixado!', description: 'Cópia independente criada.' }); },
    onError: () => toast({ title: 'Erro ao baixar baralho', variant: 'destructive' }),
  });

  // Helpers for deck access
  const userOwnsDeck = (deckId: string) => userDecks.some(d => d.id === deckId);
  const userHasLinkedDeck = (turmaDeckId: string) => userDecks.some(d => (d as any).source_turma_deck_id === turmaDeckId && !d.is_archived);

  const handleAddDeck = () => {
    if (!selectedDeckId) return;
    const finalPrice = priceType === 'free' ? 0 : Number(price) || 0;
    mutations.shareDeck.mutate({
      deckId: selectedDeckId, subjectId: lesson?.subject_id, lessonId,
      price: finalPrice, priceType, allowDownload,
    } as any, {
      onSuccess: () => { setShowAddDeck(false); setSelectedDeckId(''); setPrice(''); setPriceType('free'); setAllowDownload(false); toast({ title: 'Baralho adicionado à aula!' }); },
      onError: (e: any) => toast({ title: e.message?.includes('duplicate') ? 'Baralho já adicionado' : 'Erro', variant: 'destructive' }),
    });
  };

  const openEditPricing = (td: any) => {
    setEditingDeck(td);
    setEditPriceType(td.price_type || 'free');
    setEditPrice(td.price ? String(td.price) : '');
    setEditAllowDownload(td.allow_download ?? false);
  };

  const handleEditPricing = () => {
    if (!editingDeck) return;
    const finalPrice = editPriceType === 'free' ? 0 : Number(editPrice) || 0;
    mutations.updateDeckPricing.mutate({ id: editingDeck.id, price: finalPrice, priceType: editPriceType, allowDownload: editAllowDownload }, {
      onSuccess: () => { setEditingDeck(null); toast({ title: 'Configuração atualizada!' }); },
      onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
    });
  };

  if (!turma || !lesson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Aula não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header — same style as ContentTab */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3 max-w-2xl">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
            if (lesson.subject_id) navigate(`/turmas/${turmaId}?folder=${lesson.subject_id}`);
            else navigate(`/turmas/${turmaId}`);
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-sm min-w-0 overflow-hidden">
            <button onClick={() => navigate(`/turmas/${turmaId}`)} className="text-muted-foreground hover:bg-muted rounded px-1.5 py-0.5 truncate max-w-[100px] transition-colors">
              {turma.name}
            </button>
            {subject && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <button onClick={() => navigate(`/turmas/${turmaId}?folder=${subject.id}`)} className="text-muted-foreground hover:bg-muted rounded px-1.5 py-0.5 truncate max-w-[100px] transition-colors">
                  {subject.name}
                </button>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground truncate">{lesson.name}</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-2xl pt-4">
        {/* Unified Content Section */}
        <LessonContent
          lessonFiles={lessonFiles}
          lessonDecks={lessonDecks}
          lessonExams={lessonExams}
          contentFolders={contentFolders}
          userDecks={userDecks}
          canEdit={canEdit}
          isAdmin={isAdmin}
          isMod={isMod}
          isSubscriber={isSubscriber}
          userId={user?.id}
          uploading={uploading}
          onFileUpload={handleFileUpload}
          onDeleteFile={(id) => deleteFileMutation.mutate(id)}
          onRenameFile={(fileId, newName) => renameFileMutation.mutate({ fileId, newName })}
          onPreviewPdf={(url, restricted) => { setPdfPreviewUrl(url); setPdfPreviewRestricted(restricted); }}
          onUpdateFileVisibility={(fileId, priceType) => updateFileVisibilityMutation.mutate({ fileId, priceType })}
          onShowAddDeck={() => { setShowAddDeck(true); setAllowDownload(false); }}
          onPreviewDeck={setPreviewDeck}
          onAddToCollection={(td) => addToCollection.mutate(td)}
          onDownloadDeck={(td) => downloadDeck.mutate(td)}
          onEditPricing={openEditPricing}
          onUnshareDeck={(id) => mutations.unshareDeck.mutate(id, { onSuccess: () => toast({ title: 'Baralho removido' }) })}
          isAddingToCollection={addToCollection.isPending}
          isDownloading={downloadDeck.isPending}
          turmaId={turmaId!}
          turmaName={turma.name}
          lessonId={lessonId}
          subjectId={lesson?.subject_id}
          subscriptionPrice={turma.subscription_price}
          onCreateFolder={(name, parentId) => createContentFolderMutation.mutate({ name, parentId })}
          onRenameFolder={(folderId, newName) => renameContentFolderMutation.mutate({ folderId, newName })}
          onDeleteFolder={(folderId) => deleteContentFolderMutation.mutate(folderId)}
          onMoveItem={(itemType, itemId, targetFolderId) => moveItemMutation.mutate({ itemType, itemId, targetFolderId })}
          onImportExam={handleImportExamToTurma}
          onDeleteExam={(examId) => examMutations.deleteExam.mutate(examId, { onSuccess: () => toast({ title: 'Prova excluída' }) })}
          onOpenExam={handleOpenExam}
        />
      </main>

      {/* Dialogs */}
      <LessonDialogs
        showAddDeck={showAddDeck} setShowAddDeck={setShowAddDeck}
        selectedDeckId={selectedDeckId} setSelectedDeckId={setSelectedDeckId}
        availableDecks={availableDecks.map(d => ({ id: d.id, name: d.name }))}
        priceType={priceType} setPriceType={setPriceType}
        price={price} setPrice={setPrice}
        allowDownload={allowDownload} setAllowDownload={setAllowDownload}
        onAddDeck={handleAddDeck}
        isAddingDeck={mutations.shareDeck.isPending}
        editingDeck={editingDeck} setEditingDeck={setEditingDeck}
        editPriceType={editPriceType} setEditPriceType={setEditPriceType}
        editPrice={editPrice} setEditPrice={setEditPrice}
        editAllowDownload={editAllowDownload} setEditAllowDownload={setEditAllowDownload}
        onEditPricing={handleEditPricing}
        isEditingPricing={mutations.updateDeckPricing.isPending}
        renamingFile={null} setRenamingFile={() => {}}
        renameFileName={''} setRenameFileName={() => {}}
        onRenameFile={() => {}}
        isRenaming={false}
        previewDeck={previewDeck} setPreviewDeck={setPreviewDeck}
        userHasLinkedDeck={userHasLinkedDeck}
        userOwnsDeck={userOwnsDeck}
        onAddToCollection={(td) => addToCollection.mutate(td, { onSuccess: () => setPreviewDeck(null) })}
        onDownloadDeck={(td) => downloadDeck.mutate(td, { onSuccess: () => setPreviewDeck(null) })}
        isAddingToCollection={addToCollection.isPending}
        isDownloading={downloadDeck.isPending}
        pdfPreviewUrl={pdfPreviewUrl} setPdfPreviewUrl={setPdfPreviewUrl}
        pdfPreviewRestricted={pdfPreviewRestricted}
      />
    </div>
  );
};

export default LessonDetail;
