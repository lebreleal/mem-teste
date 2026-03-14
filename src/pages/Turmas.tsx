/**
 * Explorar — grid of published classes + public decks with search and tag filters.
 */

import { useState, useMemo } from 'react';
import { useDeckOnlyTags, useDeckTagsBatch, useTagDescendants } from '@/hooks/useTags';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useDiscoverTurmas, usePublicDecks, type Turma } from '@/hooks/useTurmas';
import { useDecks } from '@/hooks/useDecks';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Search, Star, Crown, BadgeCheck,
  Sparkles, Layers, RefreshCw, Tag as TagIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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

/* ── Classe Card ── */
const ClasseCard = ({
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
      <h3 className="font-display font-bold text-sm text-foreground line-clamp-2 leading-snug flex-1">{turma.name}</h3>
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
        Ver classe
      </span>
    )}
  </div>
);

/* ── Public Deck Card ── */
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
  const { user } = useAuth();
  const { decks: userDecks } = useDecks();

  const followedDeckNames = useMemo(() => {
    const names = new Set<string>();
    userDecks.forEach((d: any) => {
      if (d.is_live_deck || d.source_listing_id || d.source_turma_deck_id) {
        if (d.name) names.add(d.name.toLowerCase());
      }
    });
    return names;
  }, [userDecks]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data: discoverTurmas, isLoading: discoverLoading } = useDiscoverTurmas(searchQuery);
  const { data: publicDecks, isLoading: publicDecksLoading } = usePublicDecks(searchQuery);
  const { data: allTags = [] } = useDeckOnlyTags();

  const publicDeckIds = useMemo(() => (publicDecks ?? []).map((d: any) => d.id), [publicDecks]);
  const { data: deckTagsMap = {} } = useDeckTagsBatch(publicDeckIds);
  const { data: descendantIds } = useTagDescendants(selectedTag);

  // User's turma IDs for "Inscrito" badge
  const myTurmaIds = useMemo(() => {
    const ids = new Set<string>();
    userDecks.forEach((d: any) => {
      if (d.source_turma_deck_id) {
        // Mark as subscribed if user has imported decks from this community
      }
    });
    return ids;
  }, [userDecks]);

  const communities = useMemo(() => discoverTurmas ?? [], [discoverTurmas]);

  const filteredDecks = useMemo(() => {
    let decks = publicDecks ?? [];
    if (selectedTag && descendantIds) {
      const tagSet = new Set(descendantIds);
      decks = decks.filter((d: any) => {
        const tags = deckTagsMap[d.id] ?? [];
        return tags.some(t => tagSet.has(t.id));
      });
    }
    return decks;
  }, [publicDecks, selectedTag, descendantIds, deckTagsMap]);

  const loading = discoverLoading || publicDecksLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Explorar</h1>
            <p className="text-[10px] text-muted-foreground">Descubra salas de aula e decks públicos</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-4xl">
        {/* Search + Tag filters */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar salas e decks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
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
            {/* ── Salas Section ── */}
            {communities.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display text-base font-bold text-foreground mb-3">Salas de Aula</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {communities.map(turma => (
                    <SalaCard
                      key={turma.id}
                      turma={turma}
                      onClick={() => navigate(`/turmas/${turma.id}`)}
                      isMine={myTurmaIds.has(turma.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Public Decks Section ── */}
            {filteredDecks.length > 0 && (
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
                <h2 className="font-display text-lg font-bold text-foreground">Nenhum resultado encontrado</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum conteúdo público disponível.'}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Turmas;
