/**
 * TurmaDetail page — Sala de Aula view.
 * Owner sees full management, followers see read-only content.
 * Non-members see public preview with "Seguir" button.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';

import TurmaHeader from '@/components/turma-detail/TurmaHeader';
import TurmaSubHeader from '@/components/turma-detail/TurmaSubHeader';
import ContentTab from '@/components/turma-detail/ContentTab';
import {
  CreateSubjectDialog,
  EditSubjectDialog,
} from '@/components/turma-detail/TurmaDialogs';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Users, Star, Crown, BookOpen,
  Info, Layers, Globe, Lock, Heart, Check,
  FolderOpen, FileText, Clock, ShieldCheck, User,
} from 'lucide-react';
import { useTurmas } from '@/hooks/useTurmas';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// ─── Public Sala View (visitor / non-follower) ───
const PublicSalaView = () => {
  const ctx = useTurmaDetail();
  const { turma, turmaId, isMember, members } = ctx;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(false);

  const coverUrl = turma?.cover_image_url;
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
  const memberCount = fullPreview?.member_count ?? 0;

  // Follow sala = join + create linked folder + download first deck as live deck
  const handleFollow = async () => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      // 1. Join as member
      await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any);

      // 2. Create linked folder on user's dashboard
      const { data: existingFolders } = await supabase.from('folders')
        .select('id').eq('user_id', user.id).eq('source_turma_id', turmaId);

      let folderId: string | null = null;
      if (existingFolders && existingFolders.length > 0) {
        folderId = existingFolders[0].id;
      } else {
        const { data: newFolder } = await supabase.from('folders')
          .insert({ user_id: user.id, name: turma?.name || 'Sala', section: 'community', source_turma_id: turmaId } as any)
          .select().single();
        folderId = (newFolder as any)?.id ?? null;
      }

      // 3. Auto-download first published deck as live deck
      const { data: firstDeck } = await supabase.from('turma_decks')
        .select('id, deck_id')
        .eq('turma_id', turmaId)
        .eq('is_published', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstDeck) {
        const { data: originalDeck } = await supabase.from('decks')
          .select('name, algorithm_mode, daily_new_limit, daily_review_limit')
          .eq('id', (firstDeck as any).deck_id).single();

        if (originalDeck) {
          const od = originalDeck as any;
          // Check if already downloaded
          const { data: existing } = await supabase.from('decks')
            .select('id').eq('user_id', user.id).eq('source_turma_deck_id', (firstDeck as any).id);

          if (!existing || existing.length === 0) {
            await supabase.from('decks').insert({
              name: od.name,
              user_id: user.id,
              folder_id: folderId,
              algorithm_mode: od.algorithm_mode ?? 'fsrs',
              daily_new_limit: od.daily_new_limit ?? 20,
              daily_review_limit: od.daily_review_limit ?? 9999,
              source_turma_deck_id: (firstDeck as any).id,
              is_live_deck: true,
              community_id: turmaId,
            } as any);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
      queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: '✅ Seguindo sala! O primeiro deck foi adicionado à sua coleção.' });
    } catch (e: any) {
      if (e.code === '23505' || e.message?.includes('already') || e.message?.includes('já')) {
        queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
        toast({ title: 'Você já segue esta sala' });
      } else {
        toast({ title: 'Erro ao seguir', variant: 'destructive' });
      }
    } finally {
      setFollowing(false);
    }
  };

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
          <Button variant="ghost" size="icon" className="h-8 w-8 bg-background/60 backdrop-blur-sm" onClick={() => navigate('/explorar')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 container mx-auto max-w-2xl">
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-2xl font-bold text-foreground">{turma?.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-warning" /> {ownerName}</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {memberCount} seguidores</span>
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

      {/* Follow CTA */}
      <div className="container mx-auto max-w-2xl px-4 py-4">
        <Button className="w-full gap-2" size="lg" onClick={handleFollow} disabled={following || isMember}>
          <Heart className="h-4 w-4" />
          {isMember ? 'Você segue esta sala' : following ? 'Seguindo...' : 'Seguir Sala'}
        </Button>
      </div>

      <main className="container mx-auto max-w-2xl px-4 pb-10 space-y-5">
        {/* Description */}
        {turma?.description && (
          <div className="rounded-2xl border border-border/40 bg-card p-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{turma.description}</p>
          </div>
        )}

        {/* Content Preview */}
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-8 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum conteúdo disponível</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subjects.filter((s: any) => !s.parent_id).map((subject: any) => (
              <div key={subject.id} className="rounded-xl border border-border/50 bg-card px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">{subject.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Conteúdo disponível para seguidores</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// ─── Member View (full management for owner, read-only for followers) ───
const MemberSalaView = () => {
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
        ownerName={turma.owner_name}
        createdAt={turma.created_at}
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

// ─── Router: show preview for non-members, member view otherwise ───
const TurmaDetailInner = () => {
  const { turma, isMember, isLoading, turmaId, toast, navigate } = useTurmaDetail();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  if (isLoading || !turma) {
    return (
      <div className="min-h-screen bg-background">
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
        <div className="border-b border-border/30 bg-card/50">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-6 w-40" />
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 max-w-2xl py-6 space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Unauthenticated → public preview
  if (!user) {
    navigate(`/c/${turma.share_slug || turmaId}`, { replace: true });
    return null;
  }

  // Non-member → show public sala view with "Seguir" button
  if (!isMember) return <PublicSalaView />;

  // Member → full view
  return <MemberSalaView />;
};

const TurmaDetail = () => (
  <TurmaDetailProvider>
    <TurmaDetailInner />
  </TurmaDetailProvider>
);

export default TurmaDetail;
