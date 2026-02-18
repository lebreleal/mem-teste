/**
 * ContentTab – unified content view: subject folders + files + decks + exams.
 * Orchestrator component that delegates to sub-components and hooks.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTurmaDetail } from './TurmaDetailContext';
import { useContentMutations } from './content/useContentMutations';
import { useContentImport } from './content/useContentImport';
import { useDragReorder } from '@/hooks/useDragReorder';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  CheckCheck, X, ArrowUpRight, GripVertical,
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

  const contentMut = useContentMutations();
  const importLogic = useContentImport();

  // ── Local state ──
  const [reorderMode, setReorderMode] = useState(false);
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
  const [editingFile, setEditingFile] = useState<any>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editFilePriceType, setEditFilePriceType] = useState('free');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [movingItem, setMovingItem] = useState<{ type: string; id: string; name: string } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);

  // ── Data derivation ──
  const currentFolders = subjects.filter((s: any) => s.parent_id === contentFolderId)
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const lessonsForSubject = contentFolderId === null
    ? lessons.filter(l => !l.subject_id)
    : lessons.filter(l => l.subject_id === contentFolderId);
  const lessonIdsForSubject = lessonsForSubject.map(l => l.id);

  const currentDecks = contentFolderId === null
    ? turmaDecks.filter(d => !d.lesson_id && !d.subject_id)
    : turmaDecks.filter(d =>
        d.subject_id === contentFolderId ||
        (d.lesson_id && lessonIdsForSubject.includes(d.lesson_id))
      );

  const currentExams = contentFolderId === null
    ? turmaExams.filter((e: any) => !e.lesson_id && !e.subject_id)
    : turmaExams.filter((e: any) =>
        e.subject_id === contentFolderId ||
        (e.lesson_id && lessonIdsForSubject.includes(e.lesson_id))
      );

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
  const folderDrag = useDragReorder({
    items: currentFolders,
    getId: (s: any) => s.id,
    onReorder: (reordered) => contentMut.reorderSubjectsMut.mutate(reordered.map((s: any) => s.id)),
  });
  const fileDrag = useDragReorder({
    items: currentFiles,
    getId: (f: any) => f.id,
    onReorder: (reordered) => contentMut.reorderFilesMut.mutate(reordered.map((f: any) => f.id)),
  });
  const deckDrag = useDragReorder({
    items: currentDecks,
    getId: (d: any) => d.id,
    onReorder: (reordered) => contentMut.reorderDecksMut.mutate(reordered.map((d: any) => d.id)),
  });

  // ── Selection helpers ──
  const toggleItem = (key: string) => {
    setSelectedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };
  const exitSelectionMode = () => { setSelectionMode(false); setSelectedItems(new Set()); };

  // ── Deck handlers ──
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

  const handleSaveFile = () => {
    if (!editingFile) return;
    const nameChanged = editFileName.trim() && editFileName.trim() !== editingFile.file_name;
    const visChanged = editFilePriceType !== (editingFile.price_type || 'free');
    if (nameChanged) contentMut.renameFileMut.mutate({ fileId: editingFile.id, newName: editFileName.trim() });
    if (visChanged) contentMut.updateFileVisibility.mutate({ fileId: editingFile.id, pt: editFilePriceType });
    setEditingFile(null);
  };

  const handleBulkMove = () => {
    const first = Array.from(selectedItems)[0];
    if (!first) return;
    setMovingItem({ type: 'bulk', id: '', name: `${selectedItems.size} itens` });
    setMoveTargetId(null);
  };

  const confirmMove = () => {
    if (!movingItem) return;
    if (movingItem.type === 'bulk') {
      for (const key of selectedItems) {
        const [type, id] = key.split('::');
        contentMut.moveItemMut.mutate({ type, id, targetSubjectId: moveTargetId });
      }
      exitSelectionMode();
    } else {
      contentMut.moveItemMut.mutate({ type: movingItem.type, id: movingItem.id, targetSubjectId: moveTargetId });
    }
    setMovingItem(null);
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
          {hasContent && canEdit && !selectionMode && (
            <Button variant={reorderMode ? 'secondary' : 'ghost'} size="sm" className="gap-1.5" onClick={() => setReorderMode(!reorderMode)}>
              <GripVertical className="h-4 w-4" />
              {reorderMode ? 'Pronto' : 'Ordenar'}
            </Button>
          )}
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
                <DropdownMenuItem onClick={() => contentMut.fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Anexo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setShowAddDeck(true); setAllowDownload(false); }}>
                  <Copy className="mr-2 h-4 w-4" /> Baralho
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => importLogic.setShowImportExam(true)}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Prova
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <input ref={contentMut.fileInputRef} type="file" multiple className="hidden" onChange={contentMut.handleFileUpload} />
        </div>
      </div>

      {/* Bulk selection bar */}
      {selectionMode && selectedItems.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium text-foreground mr-auto">{selectedItems.size} selecionado{selectedItems.size > 1 ? 's' : ''}</span>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleBulkMove}>
            <ArrowUpRight className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Mover</span>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive" onClick={() => contentMut.handleBulkDelete(selectedItems, exitSelectionMode)}>
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
          </Button>
        </div>
      )}

      {/* Upload indicator */}
      {contentMut.uploading && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium text-foreground">Enviando arquivo(s)...</span>
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
                {reorderMode && !selectionMode && (
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
                {reorderMode && !selectionMode && (
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
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => contentMut.deleteFile.mutate(file.id)}>
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
            const alreadyLinked = importLogic.userHasLinkedDeck(td.id);
            const alreadyOwns = importLogic.userOwnsDeck(td.deck_id);
            const subscriberOnly = !importLogic.isDeckFree(td);
            const canImport = importLogic.canAccessDeck(td);
            const inCollection = alreadyOwns || alreadyLinked;
            return (
              <div key={td.id}
                {...(dhDeck ? { draggable: dhDeck.draggable, onDragStart: dhDeck.onDragStart, onDragOver: dhDeck.onDragOver, onDragEnter: dhDeck.onDragEnter, onDragLeave: dhDeck.onDragLeave, onDrop: dhDeck.onDrop, onDragEnd: dhDeck.onDragEnd } : {})}
                className={`group flex items-center gap-3 px-2 sm:px-5 py-4 transition-all hover:bg-muted/50 ${dhDeck?.className ?? ''}`}
                onClick={() => selectionMode ? toggleItem(`deck::${td.id}`) : undefined}>
                {reorderMode && !selectionMode && (
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
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (subscriberOnly && !canImport) return; importLogic.addToCollection.mutate(td); }}
                        disabled={importLogic.addToCollection.isPending || (subscriberOnly && !canImport)}>
                        {subscriberOnly && !canImport ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {inCollection && !alreadyOwns && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => importLogic.setConfirmResync(td)} disabled={importLogic.addToCollection.isPending}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {td.allow_download && !inCollection && canImport && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => importLogic.downloadDeck.mutate(td)} disabled={importLogic.downloadDeck.isPending}>
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
              {reorderMode && !selectionMode && (
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
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => importLogic.handleOpenExam(exam)}>
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
                        <DropdownMenuItem onClick={() => {
                          examMutations.toggleSubscribersOnly.mutate(
                            { examId: exam.id, subscribersOnly: !exam.subscribers_only },
                            { onSuccess: () => toast({ title: exam.subscribers_only ? 'Prova liberada para todos' : 'Prova restrita a assinantes' }) }
                          );
                        }}>
                          {exam.subscribers_only ? <Globe className="mr-2 h-4 w-4" /> : <Crown className="mr-2 h-4 w-4" />}
                          {exam.subscribers_only ? 'Liberar para todos' : 'Só assinantes'}
                        </DropdownMenuItem>
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
                {importLogic.availableDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
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
      <Dialog open={importLogic.showImportExam} onOpenChange={importLogic.setShowImportExam}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Import className="h-5 w-5 text-primary" /> Importar Prova
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione uma prova pessoal para importar.</p>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2">
            {importLogic.loadingExams ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : importLogic.personalExams.length === 0 ? (
              <div className="text-center py-6">
                <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma prova pessoal encontrada.</p>
              </div>
            ) : importLogic.personalExams.map((exam: any) => {
              const qCount = (importLogic.personalQuestionCounts as any)[exam.id] || 0;
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
                  <Button size="sm" variant="outline" disabled={importLogic.importingExamId === exam.id} onClick={() => importLogic.handleImportExamToTurma(exam)} className="gap-1.5 shrink-0">
                    {importLogic.importingExamId === exam.id ? 'Importando...' : 'Importar'}
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
          alreadyLinked={importLogic.userHasLinkedDeck(previewDeck.id)} alreadyOwns={importLogic.userOwnsDeck(previewDeck.deck_id)}
          allowDownload={previewDeck.allow_download ?? false}
          onAddToCollection={() => importLogic.addToCollection.mutate(previewDeck, { onSuccess: () => setPreviewDeck(null) })}
          onDownload={() => importLogic.downloadDeck.mutate(previewDeck, { onSuccess: () => setPreviewDeck(null) })}
          isAdding={importLogic.addToCollection.isPending} isDownloading={importLogic.downloadDeck.isPending}
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
      <Dialog open={!!importLogic.confirmResync} onOpenChange={open => !open && importLogic.setConfirmResync(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Atualizar coleção</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este baralho já está na sua coleção. Deseja sincronizar? Cards novos serão adicionados sem perder seu progresso.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => importLogic.setConfirmResync(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => { importLogic.addToCollection.mutate(importLogic.confirmResync); importLogic.setConfirmResync(null); }}>Atualizar</Button>
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
                      const descendants = contentMut.getDescendantIds(movingItem.id);
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
              <Button size="sm" onClick={confirmMove} disabled={contentMut.moveItemMut.isPending}>
                {contentMut.moveItemMut.isPending ? 'Movendo...' : 'Mover'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentTab;
