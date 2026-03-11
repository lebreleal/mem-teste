/**
 * TurmaDetail page — public community page with tabs for visitors,
 * full management view for members.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';
import CommunitySettingsDialog from '@/components/community/CommunitySettingsDialog';
import TurmaHeader from '@/components/turma-detail/TurmaHeader';
import TurmaSubHeader from '@/components/turma-detail/TurmaSubHeader';
import ContentTab from '@/components/turma-detail/ContentTab';
import {
  CreateSubjectDialog,
  EditSubjectDialog,
} from '@/components/turma-detail/TurmaDialogs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Users, Star, Crown, BookOpen, MessageCircle,
  Bell, Info, Layers, Globe, Lock, UserPlus, Check,
  FolderOpen, FileText, Clock, ShieldCheck, User,
} from 'lucide-react';
import { useTurmas } from '@/hooks/useTurmas';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';

// ─── Public Community View (visitor / non-member) ───
const PublicCommunityView = () => {
  const ctx = useTurmaDetail();
  const { turma, turmaId, isMember, members } = ctx;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { joinTurmaById } = useTurmas();
  const { startCheckout } = useSubscription();
  const [joining, setJoining] = useState(false);

  const coverUrl = turma?.cover_image_url;
  const price = turma?.subscription_price ?? 0;
  const priceYearly = (turma as any)?.subscription_price_yearly ?? 0;
  const ownerName = turma?.owner_name ?? 'Criador';
  const rating = Number(turma?.avg_rating ?? 0);
  const ratingCount = turma?.rating_count ?? 0;

  // Full preview data
  const { data: fullPreview, isLoading } = useQuery({
    queryKey: ['community-full-preview', turmaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_community_full_preview' as any, { p_turma_id: turmaId });
      if (error) throw error;
      return data as any;
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });

  const subjects = (fullPreview?.subjects ?? []) as any[];
  const lessons = (fullPreview?.lessons ?? []) as any[];
  const exams = (fullPreview?.exams ?? []) as any[];
  const previewMembers = (fullPreview?.members ?? []) as any[];
  const memberCount = fullPreview?.member_count ?? 0;

  const formatPrice = (p: number) => {
    if (!p || p <= 0) return 'Grátis';
    return `R$${(p / 100).toFixed(2).replace('.', ',')}`;
  };

  const handleJoin = async () => {
    if (!user) { navigate('/auth'); return; }
    setJoining(true);
    try {
      await joinTurmaById.mutateAsync(turmaId);
    } catch (e: any) {
      ctx.toast({ title: e.message || 'Erro ao entrar', variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const roleIcon: Record<string, typeof Crown> = { admin: Crown, moderator: ShieldCheck, member: User };
  const roleLabel: Record<string, string> = { admin: 'Admin', moderator: 'Moderador', member: 'Membro' };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative">
        <div className="h-40 sm:h-52 bg-muted/30 overflow-hidden">
          {coverUrl ? (
            <img src={coverUrl} alt={turma?.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/15 to-primary/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/60 backdrop-blur-sm" onClick={() => navigate('/turmas')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 container mx-auto max-w-2xl">
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {turma?.is_private ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="text-[11px] text-muted-foreground">{turma?.is_private ? 'Privada' : 'Pública'}</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-foreground">{turma?.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-warning" /> {ownerName}</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {memberCount} membros</span>
                {ratingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-warning fill-warning" /> {rating.toFixed(1)} ({ratingCount})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subscribe CTA */}
      <div className="container mx-auto max-w-2xl px-4 py-4">
        <div className="flex items-center gap-3">
          {price > 0 ? (
            <Button className="flex-1 gap-2" size="lg" onClick={handleJoin} disabled={joining || isMember}>
              <Crown className="h-4 w-4" />
              {isMember ? 'Você é membro' : joining ? 'Entrando...' : `Assinar por ${formatPrice(price)}/mês`}
            </Button>
          ) : (
            <Button className="flex-1 gap-2" size="lg" onClick={handleJoin} disabled={joining || isMember}>
              <UserPlus className="h-4 w-4" />
              {isMember ? 'Você é membro' : joining ? 'Entrando...' : 'Entrar Gratuitamente'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto max-w-2xl px-4 pb-10">
        <Tabs defaultValue="about" className="space-y-4">
          <TabsList className="w-full grid grid-cols-4 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
            <TabsTrigger value="about" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5 text-xs">
              <Info className="h-3.5 w-3.5" /> Sobre
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5 text-xs">
              <Layers className="h-3.5 w-3.5" /> Conteúdo
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Membros
            </TabsTrigger>
            <TabsTrigger value="feed" className="gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5 text-xs">
              <Bell className="h-3.5 w-3.5" /> Feed
            </TabsTrigger>
          </TabsList>

          {/* About */}
          <TabsContent value="about" className="space-y-4">
            {turma?.description ? (
              <div className="rounded-2xl border border-border/40 bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">Descrição</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{turma.description}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border py-8 text-center">
                <p className="text-sm text-muted-foreground">Sem descrição</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border/40 bg-card p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{subjects.length}</p>
                <p className="text-[11px] text-muted-foreground">Seções</p>
              </div>
              <div className="rounded-2xl border border-border/40 bg-card p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{exams.length}</p>
                <p className="text-[11px] text-muted-foreground">Provas</p>
              </div>
            </div>
          </TabsContent>

          {/* Content Preview */}
          <TabsContent value="content" className="space-y-2">
            {isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
            ) : subjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-8 text-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum conteúdo disponível</p>
              </div>
            ) : (
              <div className="space-y-4">
                {subjects.filter((s: any) => !s.parent_id).map((subject: any) => (
                  <div key={subject.id}>
                    <h3 className="text-sm font-semibold text-foreground mb-2">{subject.name}</h3>
                    <div className="rounded-xl border border-border/50 bg-card p-3 text-center">
                      <p className="text-[11px] text-muted-foreground">Conteúdo disponível para membros</p>
                    </div>
                  </div>
                ))}
                {exams.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Provas</h3>
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
                              {exam.time_limit_seconds && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {Math.round(exam.time_limit_seconds / 60)}min</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Members */}
          <TabsContent value="members" className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{memberCount} membro{memberCount !== 1 ? 's' : ''}</p>
            <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/50 overflow-hidden">
              {previewMembers.map((m: any, i: number) => {
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

          {/* Feed */}
          <TabsContent value="feed" className="space-y-2">
            <div className="rounded-2xl border border-dashed border-border py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Feed de atualizações em breve</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ─── Member View (existing full management) ───
const MemberCommunityView = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, turma, members, turmaDecks, turmaExams,
    isAdmin, canEdit, user,
    hasSubscription, isSubscriber, activeSubscription, subscriptionPrice, subscribing, handleSubscribe,
    mutations, updateTurma,
    showSettings, setShowSettings,
    showAddSubject, setShowAddSubject,
    newName, setNewName, newDesc, setNewDesc,
    editingSubject, setEditingSubject,
    editItemName, setEditItemName,
    handleCreateSubject,
    toast,
  } = ctx;

  return (
    <div className="min-h-screen bg-background">
      <TurmaHeader />

        <TurmaSubHeader
        turmaId={turmaId}
        turmaName={turma.name}
        inviteCode={turma.invite_code}
        shareSlug={turma.share_slug}
        isAdmin={isAdmin}
        hasSubscription={hasSubscription}
        hasExclusiveContent={
          turmaDecks.some((d: any) => d.price_type && d.price_type !== 'free') ||
          turmaExams.some((e: any) => e.subscribers_only)
        }
        isSubscriber={isSubscriber}
        activeSubscription={activeSubscription}
        subscriptionPrice={subscriptionPrice}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onShowSettings={() => setShowSettings(true)}
        members={members}
        userId={user?.id}
        mutations={mutations}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <ContentTab />
      </main>

      <CommunitySettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        turma={turma}
        members={members.map(m => ({ user_id: m.user_id, user_name: m.user_name, role: m.role, is_subscriber: m.is_subscriber }))}
        onSave={({ name, description, isPrivate, coverImageUrl, subscriptionPrice, shareSlug }) => {
          updateTurma.mutate({ turmaId, name, description, isPrivate, coverImageUrl, subscriptionPrice, shareSlug }, {
            onSuccess: () => { setShowSettings(false); toast({ title: 'Comunidade atualizada!' }); },
            onError: (e: any) => toast({ title: 'Erro ao atualizar', description: e?.message?.includes('turmas_share_slug_key') ? 'Esse link já está em uso por outra comunidade.' : undefined, variant: 'destructive' }),
          });
        }}
        isSaving={updateTurma.isPending}
      />

      <CreateSubjectDialog
        open={showAddSubject} onOpenChange={setShowAddSubject}
        name={newName} onNameChange={setNewName}
        desc={newDesc} onDescChange={setNewDesc}
        onSubmit={handleCreateSubject} isPending={mutations.createSubject.isPending}
      />
      <EditSubjectDialog
        open={!!editingSubject} onOpenChange={open => !open && setEditingSubject(null)}
        name={editItemName} onNameChange={setEditItemName}
        onSubmit={() => {
          mutations.updateSubject.mutate({ id: editingSubject!.id, name: editItemName.trim() }, {
            onSuccess: () => { setEditingSubject(null); toast({ title: 'Nome atualizado!' }); },
            onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
          });
        }}
        isPending={mutations.updateSubject.isPending}
      />
    </div>
  );
};

// ─── Router: auto-join public communities, skip preview ───
const TurmaDetailInner = () => {
  const { turma, isMember, isLoading, turmaId, toast, navigate } = useTurmaDetail();
  const { user } = useAuth();
  const { joinTurmaById } = useTurmas();
  const queryClient = useQueryClient();
  const [autoJoining, setAutoJoining] = useState(false);
  const [joinCompleted, setJoinCompleted] = useState(false);

  // Auto-join public communities (no preview screen)
  useEffect(() => {
    if (isLoading || !turma || isMember || autoJoining || joinCompleted) return;
    if (!user) { navigate('/auth'); return; }
    // Only auto-join public communities
    if (turma.is_private) return;
    setAutoJoining(true);
    joinTurmaById.mutateAsync(turmaId)
      .then(() => {
        // Invalidate role query so isMember updates
        queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
        queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
        setJoinCompleted(true);
      })
      .catch((e: any) => {
        // If already a member, treat as success
        if (e.message?.includes('already') || e.message?.includes('já')) {
          queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
          setJoinCompleted(true);
        } else {
          toast({ title: e.message || 'Erro ao entrar', variant: 'destructive' });
        }
      })
      .finally(() => setAutoJoining(false));
  }, [isLoading, turma, isMember, autoJoining, joinCompleted, user, turmaId]);

  if (isLoading || !turma || autoJoining) {
    return (
      <div className="min-h-screen bg-background">
        {/* Simulated header */}
        <div className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </div>
        </div>
        {/* Simulated sub-header */}
        <div className="border-b border-border/30 bg-card/50">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-6 w-40" />
              <div className="flex-1" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        </div>
        {/* Simulated content */}
        <div className="container mx-auto px-4 max-w-2xl py-6 space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Private communities that user isn't a member of: show preview
  if (!isMember && turma?.is_private) return <PublicCommunityView />;
  return <MemberCommunityView />;
};

const TurmaDetail = () => (
  <TurmaDetailProvider>
    <TurmaDetailInner />
  </TurmaDetailProvider>
);

export default TurmaDetail;
