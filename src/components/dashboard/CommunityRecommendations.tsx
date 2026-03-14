/**
 * "You Might Also Like..." — Horizontal scrollable list of community decks.
 * Each item: cover image left, title + deck/card counts right.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChevronRight, Layers, HelpCircle } from 'lucide-react';
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
  deck_count: number;
  card_count: number;
  question_count: number;
  category: string;
  seller_id: string;
  seller_name?: string;
  cover: string;
  link: string;
}

/** No fallback: show only real community data */

const CommunityRecommendations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: recommendations, isLoading, isFetching } = useQuery({
    queryKey: ['community-recommendations', user?.id],
    queryFn: async () => {
      const results: CommunityDeck[] = [];

      // 1) Try marketplace listings first
      const { data: listings } = await supabase
        .from('marketplace_listings')
        .select('id, title, deck_id, card_count, category, seller_id')
        .eq('is_published', true)
        .order('downloads', { ascending: false })
        .limit(20);

      if (listings && listings.length > 0) {
        const sellerIds = [...new Set(listings.map(l => l.seller_id))];
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', sellerIds);
        const profileMap = new Map<string, string>();
        if (profiles) for (const p of profiles) profileMap.set(p.id, p.name);

        let ownedSourceIds = new Set<string>();
        if (user) {
          const { data: ownedDecks } = await supabase.from('decks').select('source_listing_id').eq('user_id', user.id).not('source_listing_id', 'is', null);
          if (ownedDecks) ownedSourceIds = new Set(ownedDecks.map((d: any) => d.source_listing_id));
        }

        for (const l of listings) {
          if (l.seller_id === user?.id) continue;
          if (ownedSourceIds.has(l.id)) continue;
          results.push({
            id: l.id, title: l.title, deck_id: l.deck_id, deck_count: 1, card_count: l.card_count,
            question_count: 0, category: l.category, seller_id: l.seller_id,
            seller_name: profileMap.get(l.seller_id),
            cover: getCoverForName(l.title), link: `/deck-preview/${l.id}`,
          });
        }
      }

      // 2) If not enough from marketplace, add community (turma) shared decks
      if (results.length < 6) {
        const { data: turmaDecks } = await supabase
          .from('turma_decks')
          .select('id, deck_id, turma_id')
          .order('created_at', { ascending: false })
          .limit(20);

        if (turmaDecks && turmaDecks.length > 0) {
          const tdDeckIds = turmaDecks.map(td => td.deck_id);
          const { data: decks } = await supabase.from('decks').select('id, name, user_id').in('id', tdDeckIds);
          const deckMap = new Map<string, { name: string; user_id: string }>();
          if (decks) for (const d of decks as any[]) deckMap.set(d.id, { name: d.name, user_id: d.user_id });

          const turmaIds = [...new Set(turmaDecks.map(td => td.turma_id))];
          const { data: turmas } = await supabase.from('turmas').select('id, name').in('id', turmaIds);
          const turmaMap = new Map<string, string>();
          if (turmas) for (const t of turmas as any[]) turmaMap.set(t.id, t.name);

          const { data: cardCounts } = await supabase.from('cards').select('deck_id').in('deck_id', tdDeckIds);
          const countMap = new Map<string, number>();
          if (cardCounts) for (const c of cardCounts as any[]) countMap.set(c.deck_id, (countMap.get(c.deck_id) ?? 0) + 1);

          const seenIds = new Set(results.map(r => r.deck_id));
          for (const td of turmaDecks) {
            if (seenIds.has(td.deck_id)) continue;
            const deck = deckMap.get(td.deck_id);
            if (!deck) continue;
            seenIds.add(td.deck_id);
            results.push({
              id: td.id, title: deck.name, deck_id: td.deck_id, deck_count: 1,
              card_count: countMap.get(td.deck_id) ?? 0, question_count: 0,
              category: '', seller_id: deck.user_id, seller_name: turmaMap.get(td.turma_id),
              cover: getCoverForName(deck.name), link: `/turmas/${td.turma_id}`,
            });
          }
        }
      }

      return results.slice(0, 12);
    },
    staleTime: 30_000,
    refetchOnMount: 'always',
    enabled: !!user,
  });

  const displayDecks = recommendations ?? [];

  if ((isLoading || isFetching) && displayDecks.length === 0) {
    return (
      <div className="mt-6 px-4">
        <Skeleton className="h-5 w-48 mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!isFetching && !isLoading && displayDecks.length === 0) return null;

  return (
    <div className="mt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-base font-bold text-foreground">Você também pode gostar...</h2>
        <button
          onClick={() => navigate('/explorar')}
          className="flex items-center gap-0.5 text-xs font-medium text-foreground hover:opacity-70"
        >
          Ver mais <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Horizontal scrollable list */}
      <div
        className="flex gap-3 overflow-x-auto overflow-y-hidden px-4 pb-2 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {displayDecks.map(deck => (
          <button
            key={deck.id}
            onClick={() => navigate(deck.link)}
            className="flex items-center gap-3 flex-shrink-0 w-72 rounded-xl border border-border/50 bg-card p-3 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            {/* Cover image */}
            <img
              src={deck.cover}
              alt={deck.title}
              className="h-12 w-12 object-cover shrink-0"
              loading="lazy"
              decoding="async"
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{deck.title}</h3>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-muted-foreground">{deck.deck_count} decks</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  {deck.card_count}
                </span>
                {deck.question_count > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <HelpCircle className="h-3 w-3" />
                    {deck.question_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CommunityRecommendations;
