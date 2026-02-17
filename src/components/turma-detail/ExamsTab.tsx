/**
 * Exams tab: folder navigation + exam listing.
 * Non-subscribers see a 25% question preview for subscriber-only exams.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  ArrowLeft, Plus, FolderOpen, ChevronRight, MoreVertical, FileText, Trash2, Play, Clock, Copy, Check, Link2, Lock, Crown, Eye, EyeOff,
} from 'lucide-react';
import type { BreadcrumbItem } from './constants';

interface ExamsTabProps {
  turmaId: string;
  examFolderId: string | null;
  setExamFolderId: (id: string | null) => void;
  breadcrumb: BreadcrumbItem[];
  subjects: any[];
  turmaExams: any[];
  isAdmin: boolean;
  isMod: boolean;
  isSubscriber: boolean;
  userId?: string;
  mutations: any;
  examMutations: any;
  onImportExam: (exam: any) => void;
  toast: any;
}

const ExamsTab = ({
  turmaId, examFolderId, setExamFolderId, breadcrumb,
  subjects, turmaExams, isAdmin, isMod, isSubscriber, userId,
  mutations, examMutations, onImportExam, toast,
}: ExamsTabProps) => {
  const navigate = useNavigate();
  const [previewExam, setPreviewExam] = useState<any>(null);

  // Fetch questions for preview
  const { data: previewQuestions = [] } = useQuery({
    queryKey: ['turma-exam-preview', previewExam?.id],
    queryFn: async () => {
      const { data } = await supabase.from('turma_exam_questions').select('id, question_text, question_type, points, sort_order')
        .eq('exam_id', previewExam.id).order('sort_order', { ascending: true });
      return data ?? [];
    },
    enabled: !!previewExam?.id,
  });

  const visiblePreviewCount = Math.max(1, Math.ceil(previewQuestions.length * 0.25));

  const getSubjectsForParent = (parentId: string | null) => subjects.filter(s => (s as any).parent_id === parentId);

  const currentFolders = getSubjectsForParent(examFolderId);
  const foldersWithExams = currentFolders.filter(s => turmaExams.some((e: any) => e.subject_id === s.id));
  const currentExams = turmaExams.filter((e: any) => (e.subject_id ?? null) === examFolderId);
  const hasContent = foldersWithExams.length > 0 || currentExams.length > 0;

  const ExamRow = ({ exam }: { exam: any }) => {
    const canImport = !exam.subscribers_only || isSubscriber || isAdmin;
    return (
      <div className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-display font-semibold text-card-foreground truncate text-sm">{exam.title}</h3>
            {!exam.is_published && (
              <span className="text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full whitespace-nowrap">Rascunho</span>
            )}
            {exam.subscribers_only && (
              <Crown className="h-3.5 w-3.5 text-[hsl(270,60%,55%)] shrink-0" fill="hsl(270,60%,55%)" />
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 whitespace-nowrap"><Copy className="h-3 w-3" /> {exam.total_questions} questões</span>
            {exam.time_limit_seconds && <span className="flex items-center gap-1 whitespace-nowrap"><Clock className="h-3 w-3" /> {Math.round(exam.time_limit_seconds / 60)}min</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {exam.is_published && exam.total_questions > 0 && (
            exam.subscribers_only && !isSubscriber && !isAdmin ? (
              <Button size="sm" variant="outline" onClick={() => setPreviewExam(exam)} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Prévia
              </Button>
            ) : (
              <Button size="sm" onClick={() => onImportExam(exam)} className="gap-1.5">
                <Play className="h-3.5 w-3.5" /> Abrir
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exam.is_published && exam.total_questions > 0 && canImport && (
                <DropdownMenuItem onClick={() => onImportExam(exam)}>
                  <Link2 className="mr-2 h-4 w-4" /> Importar para Minhas Provas
                </DropdownMenuItem>
              )}
              {exam.is_published && exam.total_questions > 0 && !canImport && (
                <DropdownMenuItem disabled className="opacity-50">
                  <Lock className="mr-2 h-4 w-4" /> Apenas para assinantes
                </DropdownMenuItem>
              )}
              {!exam.is_published && (isAdmin || isMod || exam.created_by === userId) && (
                <DropdownMenuItem onClick={() => examMutations.publishExam.mutate({ examId: exam.id }, { onSuccess: () => toast({ title: 'Prova publicada!' }) })}>
                  <Check className="mr-2 h-4 w-4" /> Publicar
                </DropdownMenuItem>
              )}
              {isAdmin && exam.is_published && (
                <DropdownMenuItem onClick={() => examMutations.toggleSubscribersOnly.mutate(
                  { examId: exam.id, subscribersOnly: !exam.subscribers_only },
                  { onSuccess: () => toast({ title: exam.subscribers_only ? 'Prova aberta para todos' : 'Prova exclusiva para assinantes' }) }
                )}>
                  {exam.subscribers_only ? <Eye className="mr-2 h-4 w-4" /> : <Crown className="mr-2 h-4 w-4" />}
                  {exam.subscribers_only ? 'Abrir para todos' : 'Apenas assinantes'}
                </DropdownMenuItem>
              )}
              {(isAdmin || exam.created_by === userId) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => examMutations.deleteExam.mutate(exam.id, { onSuccess: () => toast({ title: 'Prova excluída' }) })}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      {examFolderId && (
        <div className="flex items-center gap-1 text-sm mb-1">
          {breadcrumb.map((item, i) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button onClick={() => setExamFolderId(item.id)}
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
          {examFolderId && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const current = subjects.find(s => s.id === examFolderId);
              setExamFolderId((current as any)?.parent_id ?? null);
            }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="font-display text-xl font-bold text-foreground">
            {breadcrumb[breadcrumb.length - 1]?.name ?? 'Provas'}
          </h2>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/turmas/${turmaId}/exams/new`)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova Prova
          </Button>
        )}
      </div>

      {/* List */}
      {!hasContent ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-8 text-center px-4">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="font-display text-lg font-bold text-foreground">Nenhuma prova criada ainda</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Crie uma prova para começar.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
          {foldersWithExams.map(subject => {
            const subjectExams = turmaExams.filter((e: any) => e.subject_id === subject.id);
            const examCount = subjectExams.length;
            const totalQuestions = subjectExams.reduce((sum: number, e: any) => sum + (e.total_questions || 0), 0);
            return (
              <div key={subject.id} className="group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => setExamFolderId(subject.id)}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-card-foreground truncate">{subject.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {examCount} prova{examCount !== 1 ? 's' : ''}
                    {totalQuestions > 0 && <span className="ml-1 text-primary font-medium">· {totalQuestions} questões</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-destructive" onClick={() => mutations.deleteSubject.mutate(subject.id, { onSuccess: () => toast({ title: 'Pasta excluída' }) })}>
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir Pasta
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
          {currentExams.map((exam: any) => <ExamRow key={exam.id} exam={exam} />)}
        </div>
      )}

      {/* Preview Sheet for non-subscribers */}
      <Sheet open={!!previewExam} onOpenChange={(open) => !open && setPreviewExam(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {previewExam?.title}
              <Crown className="h-4 w-4 text-[hsl(270,60%,55%)]" fill="hsl(270,60%,55%)" />
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
              <Lock className="h-4 w-4 text-warning shrink-0" />
              <p className="text-xs text-warning font-medium">
                Prévia: {visiblePreviewCount} de {previewQuestions.length} questões. Assine para acessar a prova completa.
              </p>
            </div>
            {previewQuestions.slice(0, visiblePreviewCount).map((q: any, idx: number) => (
              <div key={q.id} className="rounded-xl border border-border/40 bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${q.question_type === 'written' ? 'text-warning' : 'text-primary'}`}>
                      {q.question_type === 'written' ? 'Dissertativa' : 'Múltipla escolha'} · {q.points} pts
                    </span>
                    <div className="prose prose-sm max-w-none text-card-foreground mt-1" dangerouslySetInnerHTML={{ __html: q.question_text }} />
                  </div>
                </div>
              </div>
            ))}
            {previewQuestions.length > visiblePreviewCount && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <Lock className="h-4 w-4 inline mr-1" />
                +{previewQuestions.length - visiblePreviewCount} questões ocultas
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ExamsTab;
