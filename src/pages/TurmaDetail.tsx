/**
 * TurmaDetail page — Classe view.
 * Owner sees full management, followers see read-only content.
 * Non-members see public preview with "Seguir" button.
 */

import { useState, useCallback } from 'react';
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
  ChevronLeft, Play, Download, ChevronRight,
} from 'lucide-react';
import { useTurmas } from '@/hooks/useTurmas';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

// ─── Public Classe View (visitor / non-follower) ───
// Uses same visual layout as the dashboard Sala view
const PublicClasseView = () => {
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

  // Fetch published decks in this Sala
  const { data: publishedDecks = [], isLoading: decksLoading } = useQuery({
    queryKey: ['turma-published-decks', turmaId],
    queryFn: async () => {
      const { data: turmaDecks } = await supabase
        .from('turma_decks')
        .select('id, deck_id, is_published')
        .eq('turma_id', turmaId)
        .eq('is_published', true);
      if (!turmaDecks || turmaDecks.length === 0) return [];

      const deckIds = turmaDecks.map((td: any) => td.deck_id);
      const { data: decks } = await supabase
        .from('decks')
        .select('id, name')
        .in('id', deckIds);
      
      const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
      const countMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));
      const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));

      return turmaDecks.map((td: any) => ({
        turmaDeckId: td.id,
        deckId: td.deck_id,
        name: deckMap.get(td.deck_id) ?? 'Sem nome',
        cardCount: countMap.get(td.deck_id) ?? 0,
      }));
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });

  // Check which decks user already downloaded
  const { data: downloadedDeckIds = new Set<string>() } = useQuery({
    queryKey: ['user-downloaded-turma-decks', turmaId, user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data } = await supabase
        .from('decks')
        .select('source_turma_deck_id')
        .eq('user_id', user.id)
        .not('source_turma_deck_id', 'is', null);
      return new Set((data ?? []).map((d: any) => d.source_turma_deck_id));
    },
    enabled: !!user && !!turmaId,
    staleTime: 30_000,
  });

  // Full preview data for member count
  const { data: fullPreview } = useQuery({
    queryKey: ['community-full-preview', turmaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_community_full_preview' as any, { p_turma_id: turmaId });
      if (error) throw error;
      return data as any;
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });
  const memberCount = fullPreview?.member_count ?? 0;

  // Follow classe = join + create linked folder + download first deck
  const handleFollow = async () => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any);

      const { data: existingFolders } = await supabase.from('folders')
        .select('id').eq('user_id', user.id).eq('source_turma_id', turmaId);

      let folderId: string | null = null;
      if (existingFolders && existingFolders.length > 0) {
        folderId = existingFolders[0].id;
      } else {
        const { data: newFolder } = await supabase.from('folders')
          .insert({ user_id: user.id, name: turma?.name || 'Classe', section: 'community', source_turma_id: turmaId } as any)
          .select().single();
        folderId = (newFolder as any)?.id ?? null;
      }

      // Auto-download first published deck
      if (publishedDecks.length > 0) {
        await downloadDeck(publishedDecks[0].turmaDeckId, publishedDecks[0].deckId, publishedDecks[0].name, folderId);
      }

      queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
      queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: '✅ Seguindo classe! O primeiro deck foi adicionado à sua coleção.' });
    } catch (e: any) {
      if (e.code === '23505' || e.message?.includes('already') || e.message?.includes('já')) {
        queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
        toast({ title: 'Você já segue esta classe' });
      } else {
        toast({ title: 'Erro ao seguir', variant: 'destructive' });
      }
    } finally {
      setFollowing(false);
    }
  };

  const downloadDeck = useCallback(async (turmaDeckId: string, deckId: string, deckName: string, folderId?: string | null) => {
    if (!user) return;
    const { data: existing } = await supabase.from('decks')
      .select('id').eq('user_id', user.id).eq('source_turma_deck_id', turmaDeckId);
    if (existing && existing.length > 0) return;

    const { data: originalDeck } = await supabase.from('decks')
      .select('algorithm_mode, daily_new_limit, daily_review_limit')
      .eq('id', deckId).single();
    const od = originalDeck as any;

    await supabase.from('decks').insert({
      name: deckName,
      user_id: user.id,
      folder_id: folderId ?? null,
      algorithm_mode: od?.algorithm_mode ?? 'fsrs',
      daily_new_limit: od?.daily_new_limit ?? 20,
      daily_review_limit: od?.daily_review_limit ?? 9999,
      source_turma_deck_id: turmaDeckId,
      is_live_deck: true,
      community_id: turmaId,
    } as any);
  }, [user, turmaId]);

  const [downloadingDeck, setDownloadingDeck] = useState<string | null>(null);
  const handleDownloadDeck = useCallback(async (deck: typeof publishedDecks[0]) => {
    if (!user) { navigate('/auth'); return; }
    setDownloadingDeck(deck.turmaDeckId);
    try {
      // Ensure user is member
      if (!isMember) {
        await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any).single();
      }

      // Get or create linked folder
      const { data: existingFolders } = await supabase.from('folders')
        .select('id').eq('user_id', user.id).eq('source_turma_id', turmaId);
      let folderId: string | null = null;
      if (existingFolders && existingFolders.length > 0) {
        folderId = existingFolders[0].id;
      } else {
        const { data: newFolder } = await supabase.from('folders')
          .insert({ user_id: user.id, name: turma?.name || 'Classe', section: 'community', source_turma_id: turmaId } as any)
          .select().single();
        folderId = (newFolder as any)?.id ?? null;
      }

      await downloadDeck(deck.turmaDeckId, deck.deckId, deck.name, folderId);
      queryClient.invalidateQueries({ queryKey: ['user-downloaded-turma-decks'] });
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: `✅ "${deck.name}" adicionado à sua coleção!` });
    } catch (e: any) {
      if (e.code === '23505') {
        toast({ title: 'Deck já baixado' });
      } else {
        toast({ title: 'Erro ao baixar deck', variant: 'destructive' });
      }
    } finally {
      setDownloadingDeck(null);
    }
  }, [user, turmaId, turma, isMember, downloadDeck, queryClient, toast, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner — identical to Dashboard sala view */}
      <div className="relative bg-muted/50 overflow-hidden">
        <div className="absolute inset-0">
          <img src={coverUrl || defaultSalaIcon} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
        </div>

        <div className="relative px-4 pt-3 pb-4">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/explorar')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Explorar</span>
            </button>
          </div>

          {/* Sala image + name + creator — same structure as Dashboard */}
          <div className="flex items-center gap-3 mb-2">
            <img src={coverUrl || defaultSalaIcon} alt={turma?.name} className="h-14 w-14 rounded-xl object-cover border border-border/30 shadow-sm" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-display font-bold text-foreground truncate">{turma?.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">Por:</span>
                <span className="text-xs font-medium text-foreground">{ownerName}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {memberCount} seguidores</span>
                {ratingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-warning fill-warning" /> {rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Follow CTA — same style as Dashboard ESTUDAR button */}
      {!isMember && (
        <div className="flex items-center gap-4 px-4 py-3 max-w-md mx-auto md:max-w-lg">
          <Button
            onClick={handleFollow}
            disabled={following}
            className="flex-1 h-11 md:h-10 rounded-full text-base md:text-sm font-bold gap-2"
            size="lg"
          >
            <Heart className="h-4 w-4" />
            {following ? 'Seguindo...' : 'Seguir Sala'}
          </Button>
        </div>
      )}

      {/* Description */}
      <main className="pb-24">
        {turma?.description && (
          <div className="px-4 mb-3">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{turma.description}</p>
          </div>
        )}

        {/* Deck list — same visual as DeckList in Dashboard */}
        <div className="px-4">
          {decksLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : publishedDecks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum deck publicado</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 bg-card shadow-sm divide-y divide-border/50">
              {publishedDecks.map((deck) => {
                const isDownloaded = downloadedDeckIds.has(deck.turmaDeckId);
                const isDownloading = downloadingDeck === deck.turmaDeckId;
                return (
                  <div
                    key={deck.turmaDeckId}
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => !isDownloaded && handleDownloadDeck(deck)}
                  >
                    {/* Deck icon — same as DeckRow */}
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-display font-semibold text-foreground truncate">{deck.name}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Layers className="h-3 w-3" /> {deck.cardCount} cards
                      </p>
                    </div>
                    {isDownloaded ? (
                      <span className="flex items-center gap-1 text-xs text-success font-medium">
                        <Check className="h-3.5 w-3.5" /> Baixado
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 shrink-0"
                        disabled={isDownloading}
                        onClick={(e) => { e.stopPropagation(); handleDownloadDeck(deck); }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {isDownloading ? 'Baixando...' : 'Baixar'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
const MemberClasseView = () => {
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

  // Non-member → show public classe view with "Seguir" button
  if (!isMember) return <PublicClasseView />;

  // Member → full view
  return <MemberClasseView />;
};

const TurmaDetail = () => (
  <TurmaDetailProvider>
    <TurmaDetailInner />
  </TurmaDetailProvider>
);

export default TurmaDetail;
