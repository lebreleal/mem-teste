/**
 * Explorar Decks — Default: community cards with covers. Search: individual public decks.
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
  ArrowLeft, Search, BadgeCheck,
  Sparkles, Layers, RefreshCw, Tag as TagIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const formatCount = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(0)} mil`;
  return String(n);
};

/* ── Cover image mapping (same as CommunityRecommendations) ── */
const COVER_MAP: Record<string, string> = {
  medic: '/deck-covers/medicina.webp',
  saúde: '/deck-covers/medicina.webp',
  saude: '/deck-covers/medicina.webp',
  anato: '/deck-covers/medicina.webp',
  fisiolog: '/deck-covers/medicina.webp',
  cardio: '/deck-covers/medicina.webp',
  farmaco: '/deck-covers/medicina.webp',
  patolog: '/deck-covers/medicina.webp',
  neuro: '/deck-covers/neurociencia.webp',
  psico: '/deck-covers/neurociencia.webp',
  direit: '/deck-covers/direito.webp',
  jurí: '/deck-covers/direito.webp',
  constitu: '/deck-covers/direito.webp',
  penal: '/deck-covers/direito.webp',
  civil: '/deck-covers/direito.webp',
  matemát: '/deck-covers/matematica.webp',
  matemat: '/deck-covers/matematica.webp',
  cálcul: '/deck-covers/matematica.webp',
  calcul: '/deck-covers/matematica.webp',
  álgebr: '/deck-covers/matematica.webp',
  algebr: '/deck-covers/matematica.webp',
  biolog: '/deck-covers/biologia.webp',
  genétic: '/deck-covers/biologia.webp',
  genetic: '/deck-covers/biologia.webp',
  ecolog: '/deck-covers/biologia.webp',
  físic: '/deck-covers/fisica.webp',
  fisic: '/deck-covers/fisica.webp',
  mecânic: '/deck-covers/fisica.webp',
  mecanica: '/deck-covers/fisica.webp',
  termodin: '/deck-covers/fisica.webp',
  inglês: '/deck-covers/idiomas.webp',
  ingles: '/deck-covers/idiomas.webp',
  english: '/deck-covers/idiomas.webp',
  german: '/deck-covers/idiomas.webp',
  french: '/deck-covers/idiomas.webp',
  espanhol: '/deck-covers/idiomas.webp',
  idioma: '/deck-covers/idiomas.webp',
  program: '/deck-covers/programacao.webp',
  código: '/deck-covers/programacao.webp',
  codigo: '/deck-covers/programacao.webp',
  python: '/deck-covers/programacao.webp',
  java: '/deck-covers/programacao.webp',
  react: '/deck-covers/programacao.webp',
  química: '/deck-covers/quimica.webp',
  quimica: '/deck-covers/quimica.webp',
  orgânic: '/deck-covers/quimica.webp',
  organica: '/deck-covers/quimica.webp',
  bioquímic: '/deck-covers/quimica.webp',
  bioquimic: '/deck-covers/quimica.webp',
};

function getCoverForName(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, path] of Object.entries(COVER_MAP)) {
    if (lower.includes(keyword)) return path;
  }
  return '/deck-covers/geral.webp';
}

/* ── Community Card (same style as CommunityRecommendations) ── */
const CommunityCard = ({
  turma,
  onClick,
}: {
  turma: Turma & { member_count?: number; card_count?: number; owner_name?: string };
  onClick: () => void;
}) => {
  const cover = turma.cover_image_url || getCoverForName(turma.name);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-xl border border-border/50 bg-card p-3 shadow-sm hover:shadow-md transition-shadow text-left"
    >
      <img
        src={cover}
        alt={turma.name}
        className="h-12 w-12 rounded-lg object-cover shrink-0"
        loading="lazy"
        decoding="async"
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{turma.name}</h3>
        <div className="flex items-center gap-3 mt-0.5">
          {turma.owner_name && (
            <span className="text-xs text-muted-foreground truncate">por {turma.owner_name}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="h-3 w-3" />
            {formatCount(turma.card_count ?? 0)}
          </span>
        </div>
      </div>
    </button>
  );
};

/* ── Public Deck Card (search results) ── */
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
}) => {
  const cover = getCoverForName(deck.name);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-xl border border-border/50 bg-card p-3 shadow-sm hover:shadow-md transition-shadow text-left"
    >
      <img
        src={cover}
        alt={deck.name}
        className="h-12 w-12 rounded-lg object-cover shrink-0"
        loading="lazy"
        decoding="async"
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{deck.name}</h3>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">por {deck.owner_name}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="h-3 w-3" />
            {formatCount(deck.card_count)}
          </span>
        </div>
      </div>
      {(isOwner || isFollowed) && (
        <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20">
          {isOwner ? 'Seu' : '✓'}
        </span>
      )}
    </button>
  );
};

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

  const isSearching = searchQuery.trim().length > 0;

  // Default: communities. Search: public decks.
  const { data: discoverTurmas, isLoading: discoverLoading } = useDiscoverTurmas('');
  const { data: publicDecks, isLoading: publicDecksLoading } = usePublicDecks(searchQuery);
  const { data: allTags = [] } = useDeckOnlyTags();

  const publicDeckIds = useMemo(() => (publicDecks ?? []).map((d: any) => d.id), [publicDecks]);
  const { data: deckTagsMap = {} } = useDeckTagsBatch(publicDeckIds);
  const { data: descendantIds } = useTagDescendants(selectedTag);

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

  const loading = isSearching ? publicDecksLoading : discoverLoading;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Explorar Decks</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5 max-w-2xl">
        {/* Search */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar decks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* Tag filters only when searching */}
          {isSearching && allTags.length > 0 && (
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
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
            ))}
          </div>
        ) : isSearching ? (
          /* ── Search results: individual decks ── */
          filteredDecks.length > 0 ? (
            <div className="space-y-2">
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
          ) : (
            <EmptyState searchQuery={searchQuery} />
          )
        ) : (
          /* ── Default: community list ── */
          communities.length > 0 ? (
            <div className="space-y-2">
              {communities.map(turma => (
                <CommunityCard
                  key={turma.id}
                  turma={turma}
                  onClick={() => navigate(`/turmas/${turma.id}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState searchQuery="" />
          )
        )}
      </main>
    </div>
  );
};

const EmptyState = ({ searchQuery }: { searchQuery: string }) => (
  <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 text-center">
    <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
    <h2 className="font-display text-lg font-bold text-foreground">Nenhum resultado encontrado</h2>
    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
      {searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum conteúdo público disponível.'}
    </p>
  </div>
);

export default Turmas;
