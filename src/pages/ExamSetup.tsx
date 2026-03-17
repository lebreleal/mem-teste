import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTurmaExamTurmaId } from '@/services/adminService';
import { useDecks } from '@/hooks/useDecks';
import { useExamNotifications } from '@/hooks/useExamNotifications';
import { useExams } from '@/hooks/useExams';
import { useExamFolders } from '@/hooks/useExamFolders';
import { useEnergy } from '@/hooks/useEnergy';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Plus, Trash2, MoreVertical, RotateCcw, Play, Brain, Pencil,
  FolderOpen, FolderPlus, ChevronRight, ArrowUpRight, Eye, BookOpen, Flame, Loader2, Link2,
  Search, X, CheckCheck,
} from 'lucide-react';
import BuyCreditsDialog from '@/components/BuyCreditsDialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';


const ExamSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { decks } = useDecks();
  const { exams, deleteExam, restartExam, moveExam } = useExams();
  const { folders, createFolder, updateFolder, deleteFolder, moveFolder } = useExamFolders();
  const { energy } = useEnergy();
  const { data: studyStats } = useStudyStats();
  const { notifications } = useExamNotifications();
  const [creditsOpen, setCreditsOpen] = useState(false);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [deleteExamId, setDeleteExamId] = useState<string | null>(null);
  
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'folder'; id: string; name: string } | null>(null);

  // Folder dialogs
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderName, setCreateFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [moveTarget, setMoveTarget] = useState<{ type: 'exam' | 'folder'; id: string; name: string } | null>(null);
  const [moveBrowseFolderId, setMoveBrowseFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());

  const activeDecks = decks.filter(d => !d.is_archived);

  // Breadcrumb
  const breadcrumb = useMemo(() => {
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'Provas' }];
    if (!currentFolderId) return path;
    const buildPath = (fId: string) => {
      const folder = folders.find(f => f.id === fId);
      if (!folder) return;
      if (folder.parent_id) buildPath(folder.parent_id);
      path.push({ id: folder.id, name: folder.name });
    };
    buildPath(currentFolderId);
    return path;
  }, [currentFolderId, folders]);

  const currentFolders = useMemo(
    () => folders.filter(f => f.parent_id === currentFolderId && !f.is_archived),
    [folders, currentFolderId]
  );

  const allCurrentExams = useMemo(
    () => exams.filter(e => (e.folder_id ?? null) === currentFolderId),
    [exams, currentFolderId]
  );

  const q = searchQuery.toLowerCase();
  const currentExams = q
    ? allCurrentExams.filter(e => e.title.toLowerCase().includes(q))
    : allCurrentExams;

  const filteredFolders = q
    ? currentFolders.filter(f => f.name.toLowerCase().includes(q))
    : currentFolders;

  const hasContent = allCurrentExams.length > 0 || currentFolders.length > 0;

  const toggleExamSelection = (id: string) => {
    setSelectedExamIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedExamIds);
    for (const id of ids) {
      deleteExam.mutate(id);
    }
    setSelectedExamIds(new Set());
    setSelectionMode(false);
    toast({ title: `${ids.length} prova(s) excluída(s)!` });
  };

  // Move dialog helpers
  const getDescendantIds = (folderId: string): string[] => {
    const children = folders.filter(f => f.parent_id === folderId);
    return [folderId, ...children.flatMap(c => getDescendantIds(c.id))];
  };

  const movableFolders = useMemo(() => {
    if (!moveTarget) return [];
    const excludeIds = moveTarget.type === 'folder' ? getDescendantIds(moveTarget.id) : [];
    return folders.filter(f =>
      f.parent_id === moveBrowseFolderId && !f.is_archived && !excludeIds.includes(f.id)
    );
  }, [moveTarget, moveBrowseFolderId, folders]);

  const moveBreadcrumb = useMemo(() => {
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'Raiz' }];
    if (!moveBrowseFolderId) return path;
    const buildPath = (fId: string) => {
      const folder = folders.find(f => f.id === fId);
      if (!folder) return;
      if (folder.parent_id) buildPath(folder.parent_id);
      path.push({ id: folder.id, name: folder.name });
    };
    buildPath(moveBrowseFolderId);
    return path;
  }, [moveBrowseFolderId, folders]);

  const handleCreateFolder = () => {
    if (!createFolderName.trim()) return;
    createFolder.mutate({ name: createFolderName.trim(), parentId: currentFolderId }, {
      onSuccess: () => { setCreateFolderOpen(false); setCreateFolderName(''); toast({ title: 'Pasta criada!' }); },
    });
  };

  const handleRename = () => {
    if (!renameTarget || !renameName.trim()) return;
    updateFolder.mutate({ id: renameTarget.id, name: renameName.trim() }, {
      onSuccess: () => { setRenameTarget(null); toast({ title: 'Renomeado!' }); },
    });
  };

  const handleMove = () => {
    if (!moveTarget) return;
    if (moveTarget.type === 'exam') {
      moveExam.mutate({ examId: moveTarget.id, folderId: moveBrowseFolderId }, {
        onSuccess: () => { setMoveTarget(null); toast({ title: 'Prova movida!' }); },
      });
    } else {
      moveFolder.mutate({ id: moveTarget.id, parentId: moveBrowseFolderId }, {
        onSuccess: () => { setMoveTarget(null); toast({ title: 'Pasta movida!' }); },
      });
    }
  };

  const getExamStatusInfo = (status: string) => {
    switch (status) {
      case 'pending': return { label: 'Não iniciada', className: 'bg-muted text-muted-foreground' };
      case 'completed': return { label: 'Concluída', className: 'bg-success/15 text-success' };
      default: return { label: 'Em progresso', className: 'bg-primary/15 text-primary' };
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-display text-lg font-bold text-foreground">Provas</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/activity?tab=streak')}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors hover:bg-muted/50"
              style={{ background: 'hsl(var(--warning) / 0.1)' }}
            >
              <Flame className="h-3.5 w-3.5" style={{ color: 'hsl(var(--warning))' }} />
              <span className="text-xs font-bold text-foreground tabular-nums">{studyStats?.streak ?? 0}</span>
            </button>
            <button
              onClick={() => setCreditsOpen(true)}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1 transition-colors hover:bg-muted/50"
              style={{ background: 'hsl(var(--energy-purple) / 0.1)' }}
            >
              <Brain className="h-3.5 w-3.5" style={{ color: 'hsl(var(--energy-purple))' }} />
              <span className="text-xs font-bold text-foreground tabular-nums">{energy}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-1 text-sm">
          {breadcrumb.map((item, i) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button
                onClick={() => setCurrentFolderId(item.id)}
                className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${
                  i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.name}
              </button>
            </span>
          ))}
        </div>

        {/* Title + Actions */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentFolderId && (
              <Button variant="ghost" size="icon" onClick={() => {
                const current = folders.find(f => f.id === currentFolderId);
                setCurrentFolderId(current?.parent_id ?? null);
              }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h2 className="font-display text-2xl font-bold text-foreground">
              {breadcrumb[breadcrumb.length - 1]?.name ?? 'Provas'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hasContent && (
              <Button variant={searchOpen ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}>
                {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </Button>
            )}
            {allCurrentExams.length > 0 && !selectionMode && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectionMode(true)}>
                <CheckCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Selecionar</span>
              </Button>
            )}
            {selectionMode && (
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => { setSelectionMode(false); setSelectedExamIds(new Set()); }}>
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </Button>
            )}
            {!selectionMode && (
              <>
                <Button variant="outline" onClick={() => { setCreateFolderOpen(true); setCreateFolderName(''); }} className="gap-2">
                  <FolderPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nova Pasta</span>
                </Button>
                <Button onClick={() => navigate('/exam/new/create')} className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nova Prova</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="mb-3">
            <Input
              placeholder="Buscar por nome..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
              className="h-9"
            />
          </div>
        )}

        {/* Bulk selection bar */}
        {selectionMode && selectedExamIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 mb-3">
            <span className="text-sm font-medium text-foreground mr-auto">{selectedExamIds.size} selecionada{selectedExamIds.size > 1 ? 's' : ''}</span>
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => {
              if (selectedExamIds.size === currentExams.length) setSelectedExamIds(new Set());
              else setSelectedExamIds(new Set(currentExams.map(e => e.id)));
            }}>
              <CheckCheck className="h-3.5 w-3.5" /><span className="hidden sm:inline">{selectedExamIds.size === currentExams.length ? 'Desmarcar' : 'Todos'}</span>
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive" onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
            </Button>
          </div>
        )}

        {/* Content */}
        {filteredFolders.length === 0 && currentExams.length === 0 && notifications.filter(n => n.status === 'generating').length === 0 ? (
          q ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-8 text-center px-4">
              <Search className="h-7 w-7 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum resultado para "{searchQuery}"</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 sm:py-16 text-center px-4">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
                <BookOpen className="h-8 w-8 text-accent-foreground" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                {currentFolderId ? 'Pasta vazia' : 'Nenhuma prova ainda'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Crie sua primeira prova ou pasta para organizar suas avaliações.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCreateFolderOpen(true); setCreateFolderName(''); }} className="gap-2">
                  <FolderPlus className="h-4 w-4" /> Nova Pasta
                </Button>
                <Button size="sm" onClick={() => navigate('/exam/new/create')} className="gap-2">
                  <Plus className="h-4 w-4" /> Nova Prova
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
            {/* Folders */}
            {filteredFolders.map(folder => {
              const folderExams = exams.filter(e => e.folder_id === folder.id);
              const folderExamCount = folderExams.length;
              const folderTotalQuestions = folderExams.reduce((sum, e) => sum + (e.total_points || 0), 0);
              const hasLinkedExam = folderExams.some(e => !!e.source_turma_exam_id);
              return (
                <div
                  key={folder.id}
                  className="group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => setCurrentFolderId(folder.id)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-display font-semibold text-card-foreground truncate">{folder.name}</h3>
                      {hasLinkedExam && <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {folderExamCount} prova{folderExamCount !== 1 ? 's' : ''}
                      {folderTotalQuestions > 0 && <span className="ml-1 text-primary font-medium">· {folderTotalQuestions} questões</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setRenameTarget({ id: folder.id, name: folder.name }); setRenameName(folder.name); }}>
                          <Pencil className="mr-2 h-4 w-4" /> Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setMoveTarget({ type: 'folder', id: folder.id, name: folder.name }); setMoveBrowseFolderId(null); }}>
                          <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={hasLinkedExam ? 'opacity-40 pointer-events-none' : 'text-destructive focus:text-destructive'}
                          disabled={hasLinkedExam}
                          onClick={() => !hasLinkedExam && setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name })}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          {hasLinkedExam && <span className="ml-1 text-[10px]">(remova provas vinculadas)</span>}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}

            {/* Generating exams (AI in progress) */}
            {currentFolderId === null && notifications.filter(n => n.status === 'generating').map(notif => (
              <div
                key={notif.id}
                className="flex items-center gap-4 px-5 py-4 opacity-50 pointer-events-none animate-pulse"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-display font-semibold text-card-foreground truncate">{notif.title}</h3>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold bg-primary/15 text-primary flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Gerando...
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Criando questões com IA...</p>
                </div>
              </div>
            ))}

            {/* Exams */}
            {currentExams.map(exam => {
              const statusInfo = getExamStatusInfo(exam.status);
              const isPending = exam.status === 'pending';
              const isCompleted = exam.status === 'completed';
              const linkedDeck = activeDecks.find(d => d.id === exam.deck_id);

              return (
                <div
                  key={exam.id}
                  className={`group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors ${selectionMode && selectedExamIds.has(exam.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                  onClick={() => { if (selectionMode) { toggleExamSelection(exam.id); return; } navigate(isCompleted ? `/exam/${exam.id}/results` : `/exam/${exam.id}`); }}
                >
                  {selectionMode && (
                    <div className="shrink-0" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedExamIds.has(exam.id)} onCheckedChange={() => toggleExamSelection(exam.id)} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-display font-semibold text-card-foreground truncate">{exam.title}</h3>
                      {exam.source_turma_exam_id && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const turmaId = await fetchTurmaExamTurmaId(exam.source_turma_exam_id);
                            if (turmaId) navigate(`/turmas/${turmaId}`);
                          }}
                          className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                          title="Ver na comunidade"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {linkedDeck ? `${linkedDeck.name} · ` : ''}
                      {exam.total_points} questões
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant={isCompleted ? 'outline' : isPending ? 'default' : 'secondary'}
                    className="gap-1.5 shrink-0"
                    onClick={e => { e.stopPropagation(); navigate(isCompleted ? `/exam/${exam.id}/results` : `/exam/${exam.id}`); }}
                  >
                    {isCompleted ? (
                      <><Eye className="h-3.5 w-3.5" /> Resultado</>
                    ) : isPending ? (
                      <><Play className="h-3.5 w-3.5" /> Iniciar</>
                    ) : (
                      <><Play className="h-3.5 w-3.5" /> Continuar</>
                    )}
                  </Button>

                  <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/exam/${exam.id}/edit`)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        {!exam.source_turma_exam_id ? (
                          <DropdownMenuItem onClick={() => { setMoveTarget({ type: 'exam', id: exam.id, name: exam.title }); setMoveBrowseFolderId(null); }}>
                            <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="opacity-40 pointer-events-none" disabled>
                            <ArrowUpRight className="mr-2 h-4 w-4" /> Mover para...
                            <span className="ml-1 text-[10px]">(vinculado)</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => {
                          restartExam.mutate(exam.id, {
                            onSuccess: () => { toast({ title: 'Prova reiniciada!' }); },
                          });
                        }}>
                          <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
                          setDeleteExamId(exam.id);
                        }}>
                          <Trash2 className="mr-2 h-4 w-4" /> Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete exam confirmation */}
      <AlertDialog open={!!deleteExamId} onOpenChange={v => !v && setDeleteExamId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Deletar prova?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.{exams.find(e => e.id === deleteExamId)?.source_turma_exam_id ? ' O vínculo com a comunidade será perdido.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteExamId) deleteExam.mutate(deleteExamId, { onSuccess: () => { setDeleteExamId(null); toast({ title: 'Prova deletada' }); } });
            }}>Deletar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete folder confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir pasta "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>A pasta será excluída. Provas dentro dela serão movidas para a raiz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              if (deleteTarget) deleteFolder.mutate(deleteTarget.id, { onSuccess: () => { setDeleteTarget(null); toast({ title: 'Pasta excluída' }); } });
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create folder dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Nova Pasta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleCreateFolder(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={createFolderName} onChange={e => setCreateFolderName(e.target.value)} placeholder="Ex: Provas de Anatomia" autoFocus maxLength={100} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateFolderOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!createFolderName.trim()}>Criar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={!!renameTarget} onOpenChange={v => !v && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display">Renomear Pasta</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handleRename(); }} className="space-y-4">
            <Input value={renameName} onChange={e => setRenameName(e.target.value)} autoFocus maxLength={100} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>Cancelar</Button>
              <Button type="submit" disabled={!renameName.trim()}>Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={!!moveTarget} onOpenChange={v => !v && setMoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5" /> Mover "{moveTarget?.name}"
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-sm flex-wrap">
              {moveBreadcrumb.map((item, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <button
                    onClick={() => setMoveBrowseFolderId(item.id)}
                    className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${idx === moveBreadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                  >
                    {item.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {moveBrowseFolderId && (
                <button
                  onClick={() => {
                    const parent = folders.find(f => f.id === moveBrowseFolderId);
                    setMoveBrowseFolderId(parent?.parent_id ?? null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Voltar</span>
                </button>
              )}
              {movableFolders.length === 0 && !moveBrowseFolderId && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma subpasta aqui</div>
              )}
              {movableFolders.map(f => (
                <button key={f.id} onClick={() => setMoveBrowseFolderId(f.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-left font-medium truncate">{f.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setMoveTarget(null)}>Cancelar</Button>
              <Button size="sm" onClick={handleMove}>Mover aqui</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Buy Credits Dialog */}
      <BuyCreditsDialog open={creditsOpen} onOpenChange={setCreditsOpen} currentBalance={energy} />

    </div>
  );
};

export default ExamSetup;
