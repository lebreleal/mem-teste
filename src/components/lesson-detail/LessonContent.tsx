/**
 * Unified lesson content section – files (top) + decks + exams, with optional folder grouping.
 * Priority: folders → attachments → decks → exams
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus, Upload, Eye, Download, Lock, Pencil, Trash2,
  Paperclip, FileIcon, FileText, Image, Crown, Globe,
  MoreVertical, Copy, Link2, FolderPlus, FolderOpen,
  ChevronRight, ArrowLeft, FolderInput, ClipboardList, Users, Clock, Import,
} from 'lucide-react';

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

interface ContentFolder {
  id: string;
  name: string;
  parent_id: string | null;
  lesson_id: string;
  turma_id: string;
  sort_order: number;
  created_by: string;
}

interface LessonContentProps {
  lessonFiles: any[];
  lessonDecks: any[];
  lessonExams: any[];
  contentFolders: ContentFolder[];
  userDecks: any[];
  canEdit: boolean;
  isAdmin: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  userId?: string;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onPreviewPdf: (url: string, restricted: boolean) => void;
  onUpdateFileVisibility?: (fileId: string, priceType: string) => void;
  onShowAddDeck: () => void;
  onPreviewDeck: (td: any) => void;
  onAddToCollection: (td: any) => void;
  onDownloadDeck: (td: any) => void;
  onEditPricing: (td: any) => void;
  onUnshareDeck: (tdId: string) => void;
  isAddingToCollection: boolean;
  isDownloading: boolean;
  turmaId: string;
  turmaName: string;
  lessonId?: string;
  subjectId?: string;
  subscriptionPrice?: number;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveItem?: (itemType: 'file' | 'deck', itemId: string, targetFolderId: string | null) => void;
  onImportExam: (exam: any) => void;
  onDeleteExam?: (examId: string) => void;
  onOpenExam?: (exam: any) => void;
}

const LessonContent = ({
  lessonFiles, lessonDecks, lessonExams, contentFolders, userDecks, canEdit, isAdmin, isMod, isSubscriber,
  userId, uploading, onFileUpload, onDeleteFile, onRenameFile, onPreviewPdf,
  onUpdateFileVisibility, onShowAddDeck, onPreviewDeck, onAddToCollection,
  onDownloadDeck, onEditPricing, onUnshareDeck, isAddingToCollection, isDownloading,
  turmaId, turmaName, lessonId, subjectId, subscriptionPrice, onCreateFolder, onRenameFolder, onDeleteFolder,
  onMoveItem, onImportExam, onDeleteExam, onOpenExam,
}: LessonContentProps) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editFilePriceType, setEditFilePriceType] = useState('free');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<ContentFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [movingItem, setMovingItem] = useState<{ type: 'file' | 'deck'; id: string; name: string } | null>(null);
  const [showImportExam, setShowImportExam] = useState(false);
  const [importingExamId, setImportingExamId] = useState<string | null>(null);

  // Fetch user's personal exams for import
  const { data: personalExams = [], isLoading: loadingExams } = useQuery({
    queryKey: ['personal-exams-for-import', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase.from('exams').select('id, title, total_points, time_limit_seconds, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: showImportExam && !!userId,
  });

  const personalExamIds = personalExams.map((e: any) => e.id);
  const { data: personalQuestionCounts = {} } = useQuery({
    queryKey: ['personal-exam-qcounts', personalExamIds],
    queryFn: async () => {
      if (personalExamIds.length === 0) return {};
      const { data } = await supabase.from('exam_questions').select('exam_id')
        .in('exam_id', personalExamIds);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((q: any) => { counts[q.exam_id] = (counts[q.exam_id] || 0) + 1; });
      return counts;
    },
    enabled: personalExamIds.length > 0,
  });

  const handleImportExam = async (exam: any) => {
    setImportingExamId(exam.id);
    try {
      await onImportExam(exam);
      setShowImportExam(false);
    } finally {
      setImportingExamId(null);
    }
  };

  // Helpers
  const userOwnsDeck = (deckId: string) => userDecks.some(d => d.id === deckId);
  const userHasLinkedDeck = (turmaDeckId: string) => userDecks.some(d => (d as any).source_turma_deck_id === turmaDeckId && !d.is_archived);
  const isDeckFree = (td: any) => !td.price_type || td.price_type === 'free';
  const canAccessDeck = (td: any) => {
    if (isDeckFree(td)) return true;
    if (td.shared_by === userId || userOwnsDeck(td.deck_id)) return true;
    if (isAdmin || isMod || isSubscriber) return true;
    return false;
  };

  // Filter items for current folder
  const currentFolders = contentFolders.filter(f => f.parent_id === currentFolderId);
  const currentFiles = lessonFiles.filter(f => (f.content_folder_id || null) === currentFolderId);
  const currentDecks = lessonDecks.filter(d => (d.content_folder_id || null) === currentFolderId);
  // Exams only show at root level (no folder nesting for exams)
  const currentExams = currentFolderId === null ? lessonExams : [];

  // Breadcrumb
  const buildBreadcrumb = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Conteúdo' }];
    let fId = currentFolderId;
    const trail: ContentFolder[] = [];
    while (fId) {
      const folder = contentFolders.find(f => f.id === fId);
      if (!folder) break;
      trail.unshift(folder);
      fId = folder.parent_id;
    }
    trail.forEach(f => crumbs.push({ id: f.id, name: f.name }));
    return crumbs;
  };
  const breadcrumb = buildBreadcrumb();

  const openEditFile = (file: any) => {
    setEditingFile(file);
    setEditFileName(file.file_name);
    setEditFilePriceType(file.price_type || 'free');
  };

  const handleSaveFile = () => {
    if (!editingFile) return;
    const nameChanged = editFileName.trim() && editFileName.trim() !== editingFile.file_name;
    const visChanged = editFilePriceType !== (editingFile.price_type || 'free');
    if (nameChanged) onRenameFile(editingFile.id, editFileName.trim());
    if (visChanged && onUpdateFileVisibility) onUpdateFileVisibility(editingFile.id, editFilePriceType);
    setEditingFile(null);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), currentFolderId);
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const handleRenameFolder = () => {
    if (!renamingFolder || !renameFolderName.trim()) return;
    onRenameFolder(renamingFolder.id, renameFolderName.trim());
    setRenamingFolder(null);
  };

  const handleMoveItem = (targetFolderId: string | null) => {
    if (!movingItem || !onMoveItem) return;
    onMoveItem(movingItem.type, movingItem.id, targetFolderId);
    setMovingItem(null);
  };

  const getMoveTargetFolders = () => {
    const targets: { id: string | null; name: string; depth: number }[] = [{ id: null, name: 'Raiz (Conteúdo)', depth: 0 }];
    const addChildren = (parentId: string | null, depth: number) => {
      const children = contentFolders.filter(f => f.parent_id === parentId);
      for (const child of children) {
        targets.push({ id: child.id, name: child.name, depth });
        addChildren(child.id, depth + 1);
      }
    };
    addChildren(null, 1);
    return targets;
  };

  const hasContent = currentFolders.length > 0 || currentFiles.length > 0 || currentDecks.length > 0 || currentExams.length > 0;

  return (
    <section className="mb-6">
      {/* Header with breadcrumb and add button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {currentFolderId && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
              const current = contentFolders.find(f => f.id === currentFolderId);
              setCurrentFolderId(current?.parent_id ?? null);
            }}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          {breadcrumb.length > 1 ? (
            <div className="flex items-center gap-0.5 text-sm overflow-hidden">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.id ?? 'root'} className="flex items-center gap-0.5 shrink-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <button
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={`rounded px-1 py-0.5 transition-colors hover:bg-muted truncate max-w-[120px] ${
                      i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <h2 className="font-display text-base font-bold text-foreground">Conteúdo</h2>
          )}
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-muted-foreground shrink-0">
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Anexo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowAddDeck}>
                <Copy className="mr-2 h-4 w-4" /> Baralho
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowImportExam(true)}>
                <ClipboardList className="mr-2 h-4 w-4" /> Prova
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setShowNewFolder(true); setNewFolderName(''); }}>
                <FolderPlus className="mr-2 h-4 w-4" /> Pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileUpload} />
      </div>

      {!hasContent ? (
        <div className="rounded-xl border border-dashed border-border/60 py-8 flex flex-col items-center gap-2">
          <Paperclip className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">Nenhum conteúdo</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
          {/* Folders first */}
          {currentFolders.map(folder => (
            <div key={folder.id} className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setCurrentFolderId(folder.id)}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{folder.name}</p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setRenamingFolder(folder); setRenameFolderName(folder.name); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDeleteFolder(folder.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          ))}

          {/* Files (always above decks) */}
          {currentFiles.map((file: any) => {
            const Icon = getFileIcon(file.file_type);
            const isImage = file.file_type?.startsWith('image/');
            const isPdf = file.file_type?.includes('pdf');
            const canPreview = isImage || isPdf;
            const filePriceType = file.price_type || 'free';
            const fileRestricted = filePriceType !== 'free' && !isSubscriber && !isAdmin && !isMod;
            return (
              <div key={file.id} className="group flex items-center gap-3 px-4 py-3">
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
                      if (isPdf) onPreviewPdf(file.file_url, fileRestricted);
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
                        <DropdownMenuItem onClick={() => openEditFile(file)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        {onMoveItem && (
                          <DropdownMenuItem onClick={() => setMovingItem({ type: 'file', id: file.id, name: file.file_name })}>
                            <FolderInput className="mr-2 h-4 w-4" /> Mover
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => onDeleteFile(file.id)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {/* Decks (no icon before title) */}
          {currentDecks.map((td: any) => {
            const isOwner = td.shared_by === userId;
            const alreadyLinked = userHasLinkedDeck(td.id);
            const alreadyOwns = userOwnsDeck(td.deck_id);
            const subscriberOnly = !isDeckFree(td);
            const canImport = canAccessDeck(td);
            const inCollection = alreadyOwns || alreadyLinked;
            const linkedDeck = alreadyLinked ? userDecks.find(d => (d as any).source_turma_deck_id === td.id) : null;
            return (
              <div key={td.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
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
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onPreviewDeck(td)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {!inCollection && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                      if (subscriberOnly && !canImport) return;
                      onAddToCollection(td);
                    }} disabled={isAddingToCollection || (subscriberOnly && !canImport)}>
                      {subscriberOnly && !canImport ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  {inCollection && !alreadyOwns && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onAddToCollection(td)} disabled={isAddingToCollection}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {td.allow_download && !inCollection && canImport && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDownloadDeck(td)} disabled={isDownloading}>
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
                          <DropdownMenuItem onClick={() => onEditPricing(td)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                          {onMoveItem && (
                            <DropdownMenuItem onClick={() => setMovingItem({ type: 'deck', id: td.id, name: td.deck_name })}>
                              <FolderInput className="mr-2 h-4 w-4" /> Mover
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => onUnshareDeck(td.id)}><Trash2 className="mr-2 h-4 w-4" /> Remover</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Exams (with community icon) */}
          {currentExams.map((exam: any) => (
            <div key={exam.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
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
                {onOpenExam && exam.total_questions > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => onOpenExam(exam)}>
                    <Eye className="h-3.5 w-3.5" /> Abrir
                  </Button>
                )}
                {(isAdmin || exam.created_by === userId) && onDeleteExam && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive" onClick={() => onDeleteExam(exam.id)}>
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

      {/* Import Exam Dialog */}
      <Dialog open={showImportExam} onOpenChange={setShowImportExam}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Import className="h-5 w-5 text-primary" />
              Importar Prova
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione uma prova pessoal para importar para esta aula.</p>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2">
            {loadingExams ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : personalExams.length === 0 ? (
              <div className="text-center py-6">
                <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma prova pessoal encontrada.</p>
                <p className="text-xs text-muted-foreground mt-1">Crie provas no menu Iniciar primeiro.</p>
              </div>
            ) : (
              personalExams.map((exam: any) => {
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
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={importingExamId === exam.id}
                      onClick={() => handleImportExam(exam)}
                      className="gap-1.5 shrink-0"
                    >
                      {importingExamId === exam.id ? 'Importando...' : 'Importar'}
                    </Button>
                  </div>
                );
              })
            )}
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
                  {([
                    { value: 'free', label: 'Liberado', icon: Globe },
                    { value: 'members_only', label: 'Assinantes', icon: Lock },
                  ] as const).map(opt => (
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

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display text-sm">Nova Pasta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleCreateFolder(); }} className="space-y-4">
            <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Nome da pasta" autoFocus maxLength={100} />
            <Button type="submit" className="w-full" disabled={!newFolderName.trim()}>Criar Pasta</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renamingFolder} onOpenChange={open => !open && setRenamingFolder(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display text-sm">Renomear Pasta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleRenameFolder(); }} className="space-y-4">
            <Input value={renameFolderName} onChange={e => setRenameFolderName(e.target.value)} autoFocus maxLength={100} />
            <Button type="submit" className="w-full" disabled={!renameFolderName.trim()}>Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Move Item Dialog */}
      <Dialog open={!!movingItem} onOpenChange={open => !open && setMovingItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">
              Mover "{movingItem?.name}"
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {getMoveTargetFolders().map(target => (
              <button
                key={target.id ?? 'root'}
                onClick={() => handleMoveItem(target.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left hover:bg-muted/70 transition-colors"
                style={{ paddingLeft: `${12 + target.depth * 16}px` }}
              >
                <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{target.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default LessonContent;
