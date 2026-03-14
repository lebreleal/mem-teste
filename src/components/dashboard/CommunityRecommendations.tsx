/**
 * "Você também pode gostar..." — Horizontal carousel of community decks.
 * Shows public marketplace listings the user doesn't already own.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChevronRight, Layers, BookOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

/** Map of keywords → cover image paths */
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

interface CommunityDeck {
  id: string;
  title: string;
  deck_id: string;
  card_count: number;
  category: string;
  seller_id: string;
  seller_name?: string;
  cover: string;
}

const CommunityRecommendations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['community-recommendations', user?.id],
    queryFn: async () => {
      // Fetch published marketplace listings
      const { data: listings } = await supabase
        .from('marketplace_listings')
        .select('id, title, deck_id, card_count, category, seller_id')
        .eq('is_published', true)
        .order('downloads', { ascending: false })
        .limit(20);

      if (!listings || listings.length === 0) return [];

      // Fetch seller names
      const sellerIds = [...new Set(listings.map(l => l.seller_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', sellerIds);
      const profileMap = new Map<string, string>();
      if (profiles) for (const p of profiles) profileMap.set(p.id, p.name);

      // Filter out decks the user already owns
      let ownedSourceIds = new Set<string>();
      if (user) {
        const { data: ownedDecks } = await supabase
          .from('decks')
          .select('source_listing_id')
          .eq('user_id', user.id)
          .not('source_listing_id', 'is', null);
        if (ownedDecks) {
          ownedSourceIds = new Set(ownedDecks.map((d: any) => d.source_listing_id));
        }
      }

      // Also filter own listings
      const results: CommunityDeck[] = [];
      for (const l of listings) {
        if (l.seller_id === user?.id) continue;
        if (ownedSourceIds.has(l.id)) continue;
        results.push({
          id: l.id,
          title: l.title,
          deck_id: l.deck_id,
          card_count: l.card_count,
          category: l.category,
          seller_id: l.seller_id,
          seller_name: profileMap.get(l.seller_id),
          cover: getCoverForName(l.title),
        });
      }
      return results.slice(0, 12);
    },
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="mt-6 px-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-28 w-36 rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-sm font-semibold text-foreground">Você também pode gostar...</h2>
        <button
          onClick={() => navigate('/explorar')}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Ver mais <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {recommendations.map(deck => (
          <button
            key={deck.id}
            onClick={() => navigate(`/deck-preview/${deck.id}`)}
            className="flex-shrink-0 w-40 rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <img
              src={deck.cover}
              alt={deck.title}
              className="w-full h-20 object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="p-2.5">
              <h3 className="text-xs font-semibold text-foreground truncate">{deck.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-0.5">
                  <Layers className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{deck.card_count} cards</span>
                </div>
              </div>
              {deck.seller_name && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">por {deck.seller_name}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CommunityRecommendations;
