/**
 * PublicCommunity — Full browsable public preview of a community.
 * Accessible without authentication via /c/:slugOrId
 * Uses the same visual layout as the Dashboard Sala view.
 */

import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTurmaBySlugOrId, fetchOwnerName, fetchTurmaMemberCount, fetchPublicCommunityDecks } from '@/services/adminService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Layers, Star, ChevronLeft, LogIn, Heart,
  Users, FolderOpen, BookOpen, Download, Check,
} from 'lucide-react';
import MemoCardsLogo from '@/components/MemoCardsLogo';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

/* ── Auth Gate Dialog ── */
const AuthGatePrompt = ({ open, onOpenChange, slugOrId }: {
  open: boolean; onOpenChange: (v: boolean) => void; slugOrId: string;
}) => {
  const navigate = useNavigate();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-2">
          <MemoCardsLogo size={36} />
          <h3 className="font-display text-lg font-bold text-foreground">Crie sua conta gratuita</h3>
          <p className="text-sm text-muted-foreground">Para seguir esta sala, você precisa de uma conta.</p>
        </div>
        <Button className="w-full" onClick={() => navigate('/auth', { state: { from: `/c/${slugOrId}` } })}>
          <LogIn className="mr-2 h-4 w-4" /> Criar conta e entrar
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          Continuar navegando
        </Button>
      </div>
    </div>
  );
};

/* ── Loading Skeleton ── */
const PublicCommunitySkeleton = () => (
  <div className="min-h-screen bg-background">
    <div className="relative bg-muted/50 overflow-hidden">
      <div className="px-4 pt-3 pb-4">
        <Skeleton className="h-5 w-20 mb-3" />
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-14 w-14 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
    </div>
    <div className="px-4 py-3"><Skeleton className="h-11 w-full rounded-full" /></div>
    <div className="px-4 space-y-1">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  </div>
);

/* ── Main Page ── */
const PublicCommunity = () => {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAuthGate, setShowAuthGate] = useState(false);

  // Fetch turma by slug or ID
  const { data: turma, isLoading: turmaLoading } = useQuery({
    queryKey: ['public-community', slugOrId],
    queryFn: () => fetchTurmaBySlugOrId(slugOrId!),
    enabled: !!slugOrId,
  });

  // If user is authenticated and turma loaded, redirect to the real community page
  useEffect(() => {
    if (user && turma?.id) {
      navigate(`/turmas/${turma.id}`, { replace: true });
    }
  }, [user, turma?.id, navigate]);

  // Fetch owner name
  const { data: ownerProfile } = useQuery({
    queryKey: ['public-community-owner', turma?.owner_id],
    queryFn: async () => ({ name: await fetchOwnerName(turma!.owner_id) }),
    enabled: !!turma?.owner_id,
  });

  // Fetch member count
  const { data: memberCount = 0 } = useQuery({
    queryKey: ['public-community-members', turma?.id],
    queryFn: () => fetchTurmaMemberCount(turma!.id),
    enabled: !!turma?.id,
  });

  // Fetch published decks
  const { data: publishedDecks = [], isLoading: decksLoading } = useQuery({
    queryKey: ['public-community-decks', turma?.id],
    queryFn: async () => {
      const { data: tDecks } = await supabase
        .from('turma_decks')
        .select('id, deck_id, is_published')
        .eq('turma_id', turma!.id)
        .eq('is_published', true);
      if (!tDecks || tDecks.length === 0) return [];

      const deckIds = tDecks.map((d: any) => d.deck_id);
      const { data: deckInfo } = await supabase.from('decks').select('id, name').in('id', deckIds);
      const nameMap = new Map((deckInfo ?? []).map((d: any) => [d.id, d.name]));

      const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: deckIds });
      const countMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));

      return tDecks
        .map((td: any) => ({
          turmaDeckId: td.id,
          deckId: td.deck_id,
          name: nameMap.get(td.deck_id) ?? 'Sem nome',
          cardCount: countMap.get(td.deck_id) ?? 0,
        }))
        .filter((d: any) => !d.name.includes('Caderno de Erros'));
    },
    enabled: !!turma?.id,
  });

  if (turmaLoading) return <PublicCommunitySkeleton />;

  if (!turma) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <MemoCardsLogo size={48} />
        <h1 className="font-display text-xl font-bold text-foreground">Sala não encontrada</h1>
        <p className="text-sm text-muted-foreground text-center">Esse link pode estar incorreto ou a sala foi removida.</p>
        <Button onClick={() => navigate('/')}>Ir para o início</Button>
      </div>
    );
  }

  const coverUrl = turma.cover_image_url as string | null;
  const ownerName = ownerProfile?.name ?? 'Criador';
  const rating = Number(turma.avg_rating ?? 0);
  const ratingCount = turma.rating_count ?? 0;

  const handleFollow = () => {
    if (!user) { setShowAuthGate(true); return; }
    navigate(`/turmas/${turma.id}`, { replace: true });
  };

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
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Voltar</span>
            </button>
          </div>

          {/* Sala image + name + creator */}
          <div className="flex items-center gap-3 mb-2">
            <img src={coverUrl || defaultSalaIcon} alt={turma.name} className="h-14 w-14 rounded-xl object-cover border border-border/30 shadow-sm" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-display font-bold text-foreground truncate">{turma.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">Por</span>
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

      {/* Follow CTA */}
      <div className="flex items-center gap-4 px-4 py-3 max-w-md mx-auto md:max-w-lg">
        <Button
          onClick={handleFollow}
          className="flex-1 h-11 md:h-10 rounded-full text-base md:text-sm font-bold gap-2"
          size="lg"
        >
          <Heart className="h-4 w-4" />
          {user ? 'Seguir Sala' : 'Criar conta e seguir'}
        </Button>
      </div>

      {/* Description */}
      <main className="pb-24">
        {turma.description && (
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
              {publishedDecks.map((deck) => (
                <div
                  key={deck.turmaDeckId}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Deck icon */}
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-display font-semibold text-foreground truncate">{deck.name}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Layers className="h-3 w-3" /> {deck.cardCount} cards
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Auth Gate */}
      <AuthGatePrompt open={showAuthGate} onOpenChange={setShowAuthGate} slugOrId={slugOrId!} />
    </div>
  );
};

export default PublicCommunity;
