/**
 * Community Marketplace — grid of public communities + public decks with search and category filters.
 */

import { useState, useMemo } from 'react';
import { useDeckOnlyTags, useDeckTagsBatch, useTagDescendants } from '@/hooks/useTags';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useTurmas, useDiscoverTurmas, usePublicDecks, type Turma } from '@/hooks/useTurmas';
import { useDecks } from '@/hooks/useDecks';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, Plus, Users, LogIn, Search, Star, Crown, BadgeCheck,
  Globe, Lock, Sparkles, BookOpen, Layers, RefreshCw, Tag as TagIcon, MessageCircle, LogOut,
} from 'lucide-react';
import LeaveConfirmDialog from '@/components/community/LeaveConfirmDialog';



const formatCount = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(0)} mil`;
  return String(n);
};

const RatingStars = ({ rating, count }: { rating: number; count: number }) => {
  if (count === 0) return <span className="text-[11px] text-muted-foreground">Novo</span>;
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <Star className="h-3 w-3 text-warning fill-warning" />
      <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
};

/* ── Community Card ── */
const CommunityCard = ({
  turma,
  onClick,
  isMine,
}: {
  turma: Turma & { member_count?: number; card_count?: number; owner_name?: string };
  onClick: () => void;
  isMine?: boolean;
}) => (
  <div
    className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
    onClick={onClick}
  >
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug flex-1">{turma.name}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        por <span className="font-semibold text-foreground">{turma.owner_name ?? 'Criador'}</span>
      </p>
    </div>

    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1 text-[11px] text-foreground">
        <Layers className="h-3 w-3 shrink-0" />
        <span className="font-bold">{formatCount(turma.card_count ?? 0)}</span>
      </span>
      <RatingStars rating={Number(turma.avg_rating ?? 0)} count={turma.rating_count ?? 0} />
      {(turma.subscription_price ?? 0) > 0 && (
        <Crown className="h-3.5 w-3.5 shrink-0 text-purple-500 fill-purple-500/20" />
      )}
    </div>

    {isMine ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
        ✓ Inscrito
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Inscreva-se
      </span>
    )}
  </div>
);

/* ── Public Deck Card (same visual as community card) ── */
const PublicDeckCard = ({
  deck,
  onClick,
  isOwner,
  isFollowed,
}: {
  deck: { id: string; name: string; owner_name: string; card_count: number; updated_at: string; owner_id: string };
  onClick: () => void;
  isOwner?: boolean;
  isFollowed?: boolean;
}) => (
  <div
    className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between gap-3"
    onClick={onClick}
  >
    <div className="space-y-1">
      <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug">{deck.name}</h3>
      <p className="text-xs text-muted-foreground">
        por <span className="font-semibold text-foreground">{deck.owner_name}</span>
      </p>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <RefreshCw className="h-3 w-3 shrink-0" />
        <span className="truncate">{formatDistanceToNow(new Date(deck.updated_at), { addSuffix: true, locale: ptBR })}</span>
      </p>
    </div>

    <p className="text-[11px] text-foreground flex items-center gap-1">
      <Layers className="h-3 w-3 shrink-0" />
      <span className="font-bold">{formatCount(deck.card_count)}</span>
    </p>

    {isOwner ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
        ✓ Seu deck
      </span>
    ) : isFollowed ? (
      <span className="inline-flex items-center justify-center w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
        ✓ Inscrito
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Ver deck
      </span>
    )}
  </div>
);

/* ── Main Page ── */
const Turmas = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { turmas, isLoading, joinTurma, leaveTurma } = useTurmas();
  const { decks: userDecks } = useDecks();

  // Track followed deck names for matching against public decks
  const followedDeckNames = useMemo(() => {
    const names = new Set<string>();
    userDecks.forEach((d: any) => {
      if (d.is_live_deck || d.source_listing_id || d.source_turma_deck_id) {
        if (d.name) names.add(d.name.toLowerCase());
      }
    });
    return names;
  }, [userDecks]);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'discover' | 'mine'>('discover');
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  

  const { data: discoverTurmas, isLoading: discoverLoading } = useDiscoverTurmas(searchQuery);
  const { data: publicDecks, isLoading: publicDecksLoading } = usePublicDecks(searchQuery);
  const { data: allTags = [] } = useDeckOnlyTags();

  // Fetch tags for public decks to enable tag filtering
  const publicDeckIds = useMemo(() => (publicDecks ?? []).map((d: any) => d.id), [publicDecks]);
  const { data: deckTagsMap = {} } = useDeckTagsBatch(publicDeckIds);

  // Get descendant IDs for inclusive hierarchy filtering
  const { data: descendantIds } = useTagDescendants(selectedTag);

  const myTurmaIds = new Set(turmas.map(t => t.id));

  const communities = useMemo(() => {
    if (viewMode === 'mine') {
      return turmas
        .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return discoverTurmas ?? [];
  }, [viewMode, turmas, discoverTurmas, searchQuery]);

  const filteredDecks = useMemo(() => {
    if (viewMode === 'mine') return [];
    let decks = publicDecks ?? [];
    // Apply tag filter (with hierarchy: includes descendants)
    if (selectedTag && descendantIds) {
      const tagSet = new Set(descendantIds);
      decks = decks.filter((d: any) => {
        const tags = deckTagsMap[d.id] ?? [];
        return tags.some(t => tagSet.has(t.id));
      });
    }
    return decks;
  }, [viewMode, publicDecks, selectedTag, descendantIds, deckTagsMap]);

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    joinTurma.mutate(inviteCode.trim(), {
      onSuccess: () => { setShowJoin(false); setInviteCode(''); toast({ title: 'Entrou na comunidade!' }); },
      onError: (e) => toast({ title: e.message || 'Erro', variant: 'destructive' }),
    });
  };

  const loading = viewMode === 'discover' ? (discoverLoading || publicDecksLoading) : isLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Comunidade</h1>
              <p className="text-[10px] text-muted-foreground">Descubra e aprenda com criadores</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowJoin(true)} className="gap-1.5">
              <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Código</span>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Criar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-4xl">
        {/* View toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setViewMode('discover')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              viewMode === 'discover' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Globe className="h-3.5 w-3.5" /> Descobrir
          </button>
          <button
            onClick={() => setViewMode('mine')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              viewMode === 'mine' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" /> Minhas ({turmas.length})
          </button>
        </div>

        {/* Search + Category filters */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar comunidades e decks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <TagIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <button
                onClick={() => setSelectedTag(null)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  !selectedTag
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
                }`}
              >
                Todas tags
              </button>
              {allTags.slice(0, 12).map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    selectedTag === tag.id
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent'
                  }`}
                >
                  {tag.name}
                  {tag.is_official && <BadgeCheck className="h-3 w-3 inline ml-0.5 text-blue-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Communities Section ── */}
            {communities.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display text-base font-bold text-foreground mb-3">
                  {viewMode === 'mine' ? 'Minhas Comunidades' : 'Comunidades'}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {communities.map(turma => (
                    <div key={turma.id} className="relative">
                      <CommunityCard
                        turma={turma}
                        onClick={() => navigate(`/turmas/${turma.id}`)}
                        isMine={myTurmaIds.has(turma.id)}
                      />
                      {viewMode === 'mine' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmLeave(turma.id); }}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-card/90 border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors shadow-sm"
                          title="Desinscrever-se"
                        >
                          <LogOut className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Public Decks Section ── */}
            {viewMode === 'discover' && filteredDecks.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display text-base font-bold text-foreground mb-3">Decks Públicos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredDecks.map(deck => (
                    <PublicDeckCard
                      key={deck.id}
                      deck={deck}
                      onClick={() => navigate(`/decks/${deck.id}/preview`)}
                      isOwner={deck.owner_id === user?.id}
                      isFollowed={followedDeckNames.has(deck.name?.toLowerCase())}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {communities.length === 0 && filteredDecks.length === 0 && (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h2 className="font-display text-lg font-bold text-foreground">
                  {viewMode === 'mine' ? 'Nenhuma comunidade' : 'Nenhum resultado encontrado'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {viewMode === 'mine'
                    ? 'Crie uma comunidade ou descubra comunidades públicas.'
                    : searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum conteúdo público disponível.'}
                </p>
                {viewMode === 'mine' && (
                  <Button variant="outline" className="mt-4 gap-1.5" onClick={() => setViewMode('discover')}>
                    <Globe className="h-4 w-4" /> Descobrir comunidades
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Dialog - WhatsApp contact */}
      <AlertDialog open={showCreate} onOpenChange={setShowCreate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Criar Comunidade</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Para criar uma comunidade personalizada, entre em contato conosco pelo WhatsApp. Nossa equipe vai te ajudar a configurar tudo!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a
                href="https://wa.me/5514998958122?text=Ol%C3%A1!%20Gostaria%20de%20criar%20uma%20comunidade%20no%20MemoCards."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Join by Code Dialog */}
      <Dialog open={showJoin} onOpenChange={setShowJoin}>
        <DialogContent>
          <DialogHeader><DialogTitle>Entrar com código</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Código de convite" value={inviteCode} onChange={e => setInviteCode(e.target.value)} />
            <Button onClick={handleJoin} disabled={!inviteCode.trim() || joinTurma.isPending} className="w-full">
              {joinTurma.isPending ? 'Entrando...' : 'Entrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Confirmation */}
      <LeaveConfirmDialog
        confirmLeave={confirmLeave}
        setConfirmLeave={setConfirmLeave}
        turmas={turmas}
        userId={user?.id}
        leaveTurma={leaveTurma}
        toast={toast}
      />

    </div>
  );
};

export default Turmas;
