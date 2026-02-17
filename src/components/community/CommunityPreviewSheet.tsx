import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, Star, Globe, Lock, UserPlus, ChevronRight, ChevronDown,
  BookOpen, FolderOpen, Layers, Paperclip, FileText, Eye, Crown,
  ShieldCheck, User, Clock, Copy, X, ArrowLeft,
} from 'lucide-react';
import { useCommunityContentStats } from '@/hooks/useCommunityPreview';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Turma } from '@/hooks/useTurmas';

interface CommunityPreviewSheetProps {
  turma: (Turma & { member_count: number; owner_name: string }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: (turmaId: string) => void;
  isJoining: boolean;
  isMember: boolean;
  onNavigate?: (turmaId: string) => void;
}

const roleIcon: Record<string, typeof Crown> = { admin: Crown, moderator: ShieldCheck, member: User };
const roleLabel: Record<string, string> = { admin: 'Admin', moderator: 'Moderador', member: 'Membro' };

// ─── Full Preview Component (tabbed view) ───
const FullPreview = ({
  turma, onBack, onJoin, isJoining, isMember, onNavigate, onClose,
}: {
  turma: Turma & { member_count: number; owner_name: string };
  onBack: () => void;
  onJoin: (id: string) => void;
  isJoining: boolean;
  isMember: boolean;
  onNavigate?: (id: string) => void;
  onClose: () => void;
}) => {
  const { user } = useAuth();
  const [contentFolderId, setContentFolderId] = useState<string | null>(null);

  const { data: fullPreview, isLoading } = useQuery({
    queryKey: ['community-full-preview', turma.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_community_full_preview' as any, { p_turma_id: turma.id });
      if (error) throw error;
      return data as any;
    },
    enabled: !!turma.id,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (fullPreview?.restricted) {
    return (
      <div className="space-y-4 py-8 text-center">
        <Lock className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">Esta comunidade é privada. Entre com código de convite.</p>
        <Button variant="outline" onClick={onBack}>Voltar</Button>
      </div>
    );
  }

  const subjects = (fullPreview?.subjects ?? []) as any[];
  const lessons = (fullPreview?.lessons ?? []) as any[];
  const exams = (fullPreview?.exams ?? []) as any[];
  const members = (fullPreview?.members ?? []) as any[];
  const memberCount = fullPreview?.member_count ?? 0;

  const getSubjectsForParent = (parentId: string | null) => subjects.filter((s: any) => (s.parent_id ?? null) === parentId);
  const getLessonsForSubject = (subjectId: string | null) => lessons.filter((l: any) => (l.subject_id ?? null) === subjectId);

  // Breadcrumb
  const buildBreadcrumb = (folderId: string | null) => {
    const path: { id: string | null; name: string }[] = [{ id: null, name: 'Conteúdo' }];
    if (!folderId) return path;
    const build = (id: string) => {
      const f = subjects.find((s: any) => s.id === id);
      if (!f) return;
      if (f.parent_id) build(f.parent_id);
      path.push({ id: f.id, name: f.name });
    };
    build(folderId);
    return path;
  };
  const breadcrumb = buildBreadcrumb(contentFolderId);

  return (
    <div className="space-y-3 pb-6">
      {/* Back header */}
      <div className="flex items-center gap-2 -mt-1">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <h2 className="font-display text-lg font-bold text-foreground truncate">{turma.name}</h2>
      </div>

      <Tabs defaultValue="content" className="space-y-3">
        <TabsList className="w-full grid grid-cols-3 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
          <TabsTrigger value="content" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2">
            <Layers className="h-3.5 w-3.5" /> Conteúdo
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2">
            <FileText className="h-3.5 w-3.5" /> Provas
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2">
            <Users className="h-3.5 w-3.5" /> Membros
          </TabsTrigger>
        </TabsList>

        {/* ─── Content Tab ─── */}
        <TabsContent value="content" className="space-y-2">
          {contentFolderId && (
            <div className="flex items-center gap-1 text-sm mb-1 flex-wrap">
              {breadcrumb.map((item, i) => (
                <span key={item.id ?? 'root'} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <button
                    onClick={() => setContentFolderId(item.id)}
                    className={`rounded px-1.5 py-0.5 transition-colors hover:bg-muted text-xs ${i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                  >
                    {item.name}
                  </button>
                </span>
              ))}
            </div>
          )}
          {(() => {
            const currentFolders = getSubjectsForParent(contentFolderId);
            const currentLessons = getLessonsForSubject(contentFolderId);
            const hasContent = currentFolders.length > 0 || currentLessons.length > 0;

            if (!hasContent) {
              return (
                <div className="rounded-xl border border-dashed border-border/50 py-8 text-center">
                  <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum conteúdo nesta pasta</p>
                </div>
              );
            }

            return (
              <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50 overflow-hidden">
                {currentFolders.map(folder => {
                  const childLessons = getLessonsForSubject(folder.id);
                  const childFolders = getSubjectsForParent(folder.id);
                  const totalItems = childLessons.length + childFolders.length;
                  return (
                    <div
                      key={folder.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setContentFolderId(folder.id)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FolderOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
                        <p className="text-[11px] text-muted-foreground">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </div>
                  );
                })}
                {currentLessons.map(lesson => (
                  <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{lesson.name}</p>
                      {lesson.lesson_date && (
                        <p className="text-[11px] text-muted-foreground">{lesson.lesson_date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        {/* ─── Exams Tab ─── */}
        <TabsContent value="exams" className="space-y-2">
          {exams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma prova disponível</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50 overflow-hidden">
              {exams.map((exam: any) => (
                <div key={exam.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{exam.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{exam.total_questions} questões</span>
                      {exam.time_limit_seconds && (
                        <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {Math.round(exam.time_limit_seconds / 60)}min</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Members Tab ─── */}
        <TabsContent value="members" className="space-y-2">
          <p className="text-[11px] text-muted-foreground">{memberCount} membro{memberCount !== 1 ? 's' : ''}</p>
          <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50 overflow-hidden">
            {members.map((m: any, i: number) => {
              const RoleIcon = roleIcon[m.role] ?? User;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                    <RoleIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.name || 'Anônimo'}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{roleLabel[m.role] ?? 'Membro'}</span>
                </div>
              );
            })}
            {memberCount > 20 && (
              <div className="px-4 py-2.5 text-center">
                <p className="text-[11px] text-muted-foreground">+{memberCount - 20} outros membros</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Action */}
      <div className="pt-2">
        {isMember ? (
          <Button className="w-full gap-2" size="lg" onClick={() => { onNavigate?.(turma.id); onClose(); }}>
            <ChevronRight className="h-4 w-4" /> Acessar Comunidade
          </Button>
        ) : (
          <Button className="w-full gap-2" size="lg" disabled={isJoining} onClick={() => onJoin(turma.id)}>
            <UserPlus className="h-4 w-4" /> {isJoining ? 'Entrando...' : 'Entrar na Comunidade'}
          </Button>
        )}
      </div>
    </div>
  );
};

// ─── Main Preview Content ───
const PreviewContent = ({
  turma, onJoin, isJoining, isMember, onNavigate, onClose,
}: Omit<CommunityPreviewSheetProps, 'open' | 'onOpenChange'> & { onClose: () => void }) => {
  const rating = turma?.avg_rating ? Number(turma.avg_rating) : 0;
  const ratingCount = turma?.rating_count ?? 0;
  const coverUrl = (turma as any)?.cover_image_url;
  const { data: contentStats } = useCommunityContentStats(turma?.id);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFullPreview, setShowFullPreview] = useState(false);

  if (!turma) return null;

  // Full preview mode
  if (showFullPreview) {
    return (
      <FullPreview
        turma={turma}
        onBack={() => setShowFullPreview(false)}
        onJoin={onJoin}
        isJoining={isJoining}
        isMember={isMember}
        onNavigate={onNavigate}
        onClose={onClose}
      />
    );
  }

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const InlineRating = () => (
    <span className="flex items-center gap-1 text-[11px] shrink-0">
      <Star className="h-3 w-3 text-warning fill-warning" />
      {ratingCount > 0 ? (
        <>
          <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
          <span className="text-muted-foreground">({ratingCount})</span>
        </>
      ) : (
        <span className="text-muted-foreground">Sem nota</span>
      )}
    </span>
  );

  const hasContent = contentStats && (contentStats.subjects.length > 0 || contentStats.rootLessons.length > 0);

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      {coverUrl ? (
        <div className="relative -mx-4 -mt-2 h-36 overflow-hidden rounded-b-2xl">
          <img src={coverUrl} alt={turma.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground drop-shadow-sm truncate">{turma.name}</h2>
              <InlineRating />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {turma.is_private ? (
                <span className="flex items-center gap-1 text-[11px] text-foreground/70"><Lock className="h-3 w-3" /> Privada</span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-foreground/70"><Globe className="h-3 w-3" /> Pública</span>
              )}
              <span className="text-[11px] text-foreground/70">·</span>
              <span className="flex items-center gap-1 text-[11px] text-foreground/70">
                <Users className="h-3 w-3" /> {turma.member_count} membros
              </span>
              <span className="text-[11px] text-foreground/70">·</span>
              <span className="text-[11px] text-foreground/70">Criado por {turma.owner_name}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground truncate">{turma.name}</h2>
              <InlineRating />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {turma.is_private ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> Privada</span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Globe className="h-3 w-3" /> Pública</span>
              )}
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" /> {turma.member_count} membros
              </span>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">Criado por {turma.owner_name}</span>
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {turma.description && (
        <div className="px-1">
          <p className="text-sm text-foreground/80 leading-relaxed">{turma.description}</p>
        </div>
      )}

      {/* Preview content button */}
      <div className="px-1">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setShowFullPreview(true)}
        >
          <Eye className="h-4 w-4" /> Prévia do Conteúdo
        </Button>
      </div>

      {/* Action */}
      <div className="px-1 pt-1">
        {isMember ? (
          <Button className="w-full gap-2" size="lg" onClick={() => { onNavigate?.(turma.id); onClose(); }}>
            <ChevronRight className="h-4 w-4" /> Acessar Comunidade
          </Button>
        ) : (
          <Button className="w-full gap-2" size="lg" disabled={isJoining} onClick={() => onJoin(turma.id)}>
            <UserPlus className="h-4 w-4" /> {isJoining ? 'Entrando...' : 'Entrar na Comunidade'}
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Entrar é gratuito. Alguns conteúdos podem ser exclusivos para assinantes.
        </p>
      </div>
    </div>
  );
};

const CommunityPreviewSheet = ({
  turma, open, onOpenChange, onJoin, isJoining, isMember, onNavigate,
}: CommunityPreviewSheetProps) => {
  const isMobile = useIsMobile();

  if (!turma) return null;

  const sharedProps = { turma, onJoin, isJoining, isMember, onNavigate, onClose: () => onOpenChange(false) };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{turma.name}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-2 pb-4">
            <PreviewContent {...sharedProps} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>{turma.name}</SheetTitle>
        </SheetHeader>
        <PreviewContent {...sharedProps} />
      </SheetContent>
    </Sheet>
  );
};

export default CommunityPreviewSheet;
