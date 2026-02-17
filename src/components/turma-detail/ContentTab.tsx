/**
 * Content tab: folders + lessons listing with breadcrumbs.
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Plus, FolderOpen, FolderPlus, ChevronRight, MoreVertical,
  Layers, Pencil, Trash2, Paperclip, Eye, EyeOff, BookOpen,
} from 'lucide-react';


import type { BreadcrumbItem } from './constants';

interface ContentTabProps {
  turmaId: string;
  contentFolderId: string | null;
  setContentFolderId: (id: string | null) => void;
  breadcrumb: BreadcrumbItem[];
  subjects: any[];
  lessons: any[];
  turmaDecks: any[];
  lessonFiles: { id: string; lesson_id: string }[];
  canEdit: boolean;
  canCreateSubject: boolean;
  canCreateLesson: boolean;
  isAdmin: boolean;
  mutations: any;
  onShowAddSubject: () => void;
  onShowAddLesson: () => void;
  onEditSubject: (subject: { id: string; name: string }) => void;
  onEditLesson: (lesson: { id: string; name: string; lesson_date: string | null }) => void;
  toast: any;
}

const ContentTab = ({
  turmaId, contentFolderId, setContentFolderId, breadcrumb,
  subjects, lessons, turmaDecks, lessonFiles,
  canEdit, canCreateSubject, canCreateLesson, isAdmin,
  mutations, onShowAddSubject, onShowAddLesson,
  onEditSubject, onEditLesson, toast,
}: ContentTabProps) => {
  const navigate = useNavigate();

  const getSubjectsForParent = (parentId: string | null) => subjects.filter(s => (s as any).parent_id === parentId);
  const getLessonsForSubject = (subjectId: string | null) => lessons.filter(l => l.subject_id === subjectId);

  const currentFolders = getSubjectsForParent(contentFolderId);
  const allLessons = getLessonsForSubject(contentFolderId);
  const currentLessons = canEdit ? allLessons : allLessons.filter(l => (l as any).is_published !== false);
  // Orphan decks: decks shared directly in root (no lesson_id, no subject_id) or matching current subject
  const orphanDecks = contentFolderId === null
    ? turmaDecks.filter(d => !d.lesson_id && !d.subject_id)
    : turmaDecks.filter(d => d.subject_id === contentFolderId && !d.lesson_id);
  const hasContent = currentFolders.length > 0 || currentLessons.length > 0 || orphanDecks.length > 0;

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      {contentFolderId && (
        <div className="flex items-center gap-1 text-sm mb-1">
          {breadcrumb.map((item, i) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button onClick={() => setContentFolderId(item.id)}
                className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted ${i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
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
              {breadcrumb[breadcrumb.length - 1]?.name}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canCreateSubject && (
            <Button variant="outline" size="sm" onClick={onShowAddSubject} className="gap-2">
              <FolderPlus className="h-4 w-4" /><span className="hidden sm:inline">Nova Pasta</span>
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {!hasContent ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-8 text-center px-4">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="font-display text-lg font-bold text-foreground">Nenhum conteúdo ainda</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Crie uma pasta ou adicione conteúdo.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
          {/* Folders */}
          {currentFolders.map(subject => {
            const childFolders = getSubjectsForParent(subject.id);
            const childLessons = getLessonsForSubject(subject.id);
            const totalItems = childFolders.length + childLessons.length;
            const relatedDecks = turmaDecks.filter(d => d.subject_id === subject.id || (d.lesson_id && childLessons.some(l => l.id === d.lesson_id)));
            const totalCards = relatedDecks.reduce((sum: number, d: any) => sum + (d.card_count ?? 0), 0);
            const childLessonIds = childLessons.map(l => l.id);
            const totalAttachments = lessonFiles.filter(f => childLessonIds.includes(f.lesson_id)).length;
            return (
              <div key={subject.id} className="group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => setContentFolderId(subject.id)}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-card-foreground truncate">{subject.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                    {totalCards > 0 && <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {totalCards}</span>}
                    {totalAttachments > 0 && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {totalAttachments}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => onEditSubject({ id: subject.id, name: subject.name })}>
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

          {/* Lessons */}
          {currentLessons.map(lesson => {
            const lessonDecksForLesson = turmaDecks.filter(d => d.lesson_id === lesson.id);
            const lessonCardCount = lessonDecksForLesson.reduce((sum: number, d: any) => sum + (d.card_count ?? 0), 0);
            const lessonFileCount = lessonFiles.filter(f => f.lesson_id === lesson.id).length;
            const isLessonPublished = (lesson as any).is_published !== false;
            return (
              <div key={lesson.id}
                className={`group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50 ${!isLessonPublished ? 'opacity-40' : ''}`}
                onClick={() => navigate(`/turmas/${turmaId}/lessons/${lesson.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold text-card-foreground truncate text-sm">{lesson.name}</h3>
                    {!isLessonPublished && (
                      <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        <EyeOff className="h-3 w-3 inline mr-0.5" />Oculto
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 mt-1 text-xs text-muted-foreground">
                    {lessonCardCount > 0 && <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {lessonCardCount}</span>}
                    {lessonFileCount > 0 && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {lessonFileCount}</span>}
                    {lessonCardCount === 0 && lessonFileCount === 0 && <span>Vazio</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          mutations.updateLesson.mutate({ id: lesson.id, isPublished: !isLessonPublished },
                            { onSuccess: () => toast({ title: isLessonPublished ? 'Conteúdo ocultado' : 'Conteúdo publicado' }) });
                        }}>
                          {isLessonPublished ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                          {isLessonPublished ? 'Ocultar' : 'Publicar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditLesson({ id: lesson.id, name: lesson.name, lesson_date: lesson.lesson_date })}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => mutations.deleteLesson.mutate(lesson.id, { onSuccess: () => toast({ title: 'Excluído' }) })}>
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

          {/* Orphan Decks (shared without a lesson) */}
          {orphanDecks.map((td: any) => (
            <div key={td.id}
              className="group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => navigate(`/decks/${td.deck_id}`)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/50">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-semibold text-card-foreground truncate text-sm">{td.deck_name || 'Baralho'}</h3>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {td.card_count ?? 0} cards</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive" onClick={() => mutations.unshareDeck.mutate(td.id, { onSuccess: () => toast({ title: 'Baralho removido da comunidade' }) })}>
                        <Trash2 className="mr-2 h-4 w-4" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentTab;
