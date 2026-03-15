/**
 * TurmaDetail page — Public/community Sala view.
 * Reuses the EXACT same DeckRow component from the Dashboard in readOnly mode.
 * No data duplication — reads the owner's decks directly via turma_decks RLS.
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, Users, Star, Heart, FolderOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import DeckRow from '@/components/dashboard/DeckRow';
import type { DeckWithStats } from '@/types/deck';

/**
 * Fetches the owner's published decks (+ their sub-decks) as DeckWithStats,
 * reading directly from the owner's data via turma_decks RLS.
 * NO duplication — same cards, same decks, same DB rows.
 */
function useSalaDecks(turmaId: string) {
  return useQuery<DeckWithStats[]>({
    queryKey: ['sala-decks', turmaId],
    queryFn: async () => {
      // 1. Get published turma_decks
      const { data: turmaDecks } = await supabase
        .from('turma_decks')
        .select('id, deck_id, is_published')
        .eq('turma_id', turmaId)
        .eq('is_published', true);

      if (!turmaDecks || turmaDecks.length === 0) return [];

      const rootDeckIds = turmaDecks.map((td: any) => td.deck_id);

      // 2. Fetch root decks + their children (sub-decks)
      const { data: childDecks } = await supabase
        .from('decks')
        .select('id')
        .in('parent_deck_id', rootDeckIds)
        .eq('is_archived', false);

      const allDeckIds = [...rootDeckIds, ...(childDecks ?? []).map((d: any) => d.id)];

      // 3. Fetch full deck rows
      const { data: decks } = await supabase
        .from('decks')
        .select('*')
        .in('id', allDeckIds);

      if (!decks) return [];

      // 4. Fetch card stats (state + difficulty for classification bar)
      const cardCountMap = new Map<string, { total: number; mastered: number; novo: number; facil: number; bom: number; dificil: number; errei: number }>();
      const PAGE = 1000;

      for (let i = 0; i < allDeckIds.length; i += 200) {
        const batch = allDeckIds.slice(i, i + 200);
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: cards } = await supabase
            .from('cards')
            .select('id, deck_id, state, difficulty')
            .in('deck_id', batch)
            .order('id', { ascending: true })
            .range(offset, offset + PAGE - 1);
          if (cards) {
            for (const c of cards as any[]) {
              const entry = cardCountMap.get(c.deck_id) ?? { total: 0, mastered: 0, novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
              entry.total++;
              if (c.state >= 2) entry.mastered++;
              if (c.state === 0) {
                entry.novo++;
              } else {
                const d = c.difficulty ?? 5;
                if (d <= 3) entry.facil++;
                else if (d <= 5) entry.bom++;
                else if (d <= 7) entry.dificil++;
                else entry.errei++;
              }
              cardCountMap.set(c.deck_id, entry);
            }
          }
          hasMore = (cards?.length ?? 0) === PAGE;
          offset += PAGE;
        }
      }

      // 5. Map to DeckWithStats (read-only, so study stats are zeroed for the viewer)
      return decks
        .filter((d: any) => !d.name?.includes('Caderno de Erros'))
        .map((d: any) => {
          const cc = cardCountMap.get(d.id) ?? { total: 0, mastered: 0, novo: 0, facil: 0, bom: 0, dificil: 0, errei: 0 };
          return {
            id: d.id,
            name: d.name,
            created_at: d.created_at,
            updated_at: d.updated_at,
            folder_id: d.folder_id,
            parent_deck_id: rootDeckIds.includes(d.id) ? null : d.parent_deck_id,
            is_archived: d.is_archived,
            new_count: cc.novo,
            learning_count: 0,
            review_count: 0,
            reviewed_today: 0,
            new_reviewed_today: 0,
            new_graduated_today: 0,
            daily_new_limit: d.daily_new_limit,
            daily_review_limit: d.daily_review_limit,
            total_cards: cc.total,
            mastered_cards: cc.mastered,
            class_novo: cc.novo,
            class_facil: cc.facil,
            class_bom: cc.bom,
            class_dificil: cc.dificil,
            class_errei: cc.errei,
          } satisfies DeckWithStats;
        })
        .sort((a: DeckWithStats, b: DeckWithStats) => {
          // Matérias first, then loose decks
          const aHasChildren = decks.some((d: any) => d.parent_deck_id === a.id);
          const bHasChildren = decks.some((d: any) => d.parent_deck_id === b.id);
          if (aHasChildren && !bHasChildren) return -1;
          if (!aHasChildren && bHasChildren) return 1;
          return 0;
        });
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });
}

// ─── Sala View (public, read-only) ───
const SalaView = ({ isFollower }: { isFollower: boolean }) => {
  const ctx = useTurmaDetail();
  const { turma, turmaId, isMember } = ctx;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(false);

  const coverUrl = turma?.cover_image_url;
  const ownerName = turma?.owner_name ?? 'Criador';
  const rating = Number(turma?.avg_rating ?? 0);
  const ratingCount = turma?.rating_count ?? 0;

  const { data: salaDecks = [], isLoading: decksLoading } = useSalaDecks(turmaId);

  // Member count
  const { data: memberCount = 0 } = useQuery({
    queryKey: ['turma-member-count', turmaId],
    queryFn: async () => {
      const { count } = await supabase.from('turma_members').select('id', { count: 'exact', head: true }).eq('turma_id', turmaId);
      return count ?? 0;
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });

  // Question counts per deck
  const allDeckIds = useMemo(() => salaDecks.map(d => d.id), [salaDecks]);
  const { data: questionCountMap } = useQuery({
    queryKey: ['sala-question-counts', turmaId, allDeckIds.join(',')],
    queryFn: async () => {
      if (allDeckIds.length === 0) return new Map<string, number>();
      const { data } = await supabase.from('deck_questions').select('deck_id').in('deck_id', allDeckIds);
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + 1);
      }
      return counts;
    },
    enabled: allDeckIds.length > 0,
    staleTime: 60_000,
  });

  // ── DeckRow helpers (read-only — no-op callbacks) ──
  const rootDecks = useMemo(
    () => salaDecks.filter(d => !d.parent_deck_id),
    [salaDecks],
  );

  const getSubDecks = useCallback(
    (parentId: string) => salaDecks.filter(d => d.parent_deck_id === parentId),
    [salaDecks],
  );

  const getAggregateStats = useCallback(
    (deck: DeckWithStats) => ({
      new_count: deck.new_count,
      learning_count: deck.learning_count,
      review_count: deck.review_count,
      reviewed_today: deck.reviewed_today,
    }),
    [],
  );

  const noop = useCallback(() => {}, []);
  const noopDeck = useCallback((_d: DeckWithStats) => {}, []);
  const noopStr = useCallback((_s: string) => {}, []);
  const getCommunityLinkId = useCallback((_d: DeckWithStats) => null as string | null, []);

  const [expandedDecks] = useState(new Set<string>());
  const [expandedAccordionId, setExpandedAccordionId] = useState<string | null>(null);

  // Follow = join turma_members (shortcut in dashboard)
  const handleFollow = async () => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any);

      // Create a folder shortcut in the user's dashboard
      const { data: existingFolders } = await supabase.from('folders')
        .select('id').eq('user_id', user.id).eq('source_turma_id', turmaId);

      if (!existingFolders || existingFolders.length === 0) {
        await supabase.from('folders')
          .insert({ user_id: user.id, name: turma?.name || 'Sala', section: 'community', source_turma_id: turmaId } as any);
      }

      queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
      queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: '✅ Seguindo sala! Ela aparece agora no seu menu Início.' });
    } catch (e: any) {
      if (e.code === '23505') {
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
      {/* Hero banner */}
      <div className="relative bg-muted/50 overflow-hidden">
        <div className="absolute inset-0">
          <img src={coverUrl || defaultSalaIcon} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
        </div>

        <div className="relative px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/turmas')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Explorar</span>
            </button>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <img src={coverUrl || defaultSalaIcon} alt={turma?.name} className="h-14 w-14 rounded-xl object-cover border border-border/30 shadow-sm" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-display font-bold text-foreground truncate">{turma?.name}</h1>
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
      {!isFollower && (
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

        {/* Deck list — SAME DeckRow component from Dashboard, readOnly mode */}
        {decksLoading ? (
          <div className="divide-y divide-border/50">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 animate-pulse">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-36 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : rootDecks.length === 0 ? (
          <div className="px-4">
            <div className="rounded-xl border border-dashed border-border py-8 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum deck publicado</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {rootDecks.map(deck => (
              <DeckRow
                key={deck.id}
                deck={deck}
                readOnly
                deckSelectionMode={false}
                selectedDeckIds={new Set()}
                toggleDeckSelection={noopStr}
                getSubDecks={getSubDecks}
                getAggregateStats={getAggregateStats}
                getCommunityLinkId={getCommunityLinkId}
                navigateToCommunity={noopStr}
                onCreateSubDeck={noopStr}
                onRename={noopDeck}
                onMove={noopDeck}
                onArchive={noopStr}
                onDelete={noopDeck}
                expandedDecks={expandedDecks}
                toggleExpand={noopStr}
                expandedAccordionId={expandedAccordionId}
                onAccordionToggle={(id) => setExpandedAccordionId(prev => prev === id ? null : id)}
                questionCountMap={questionCountMap}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// ─── Router ───
const TurmaDetailInner = () => {
  const { turma, isMember, isLoading } = useTurmaDetail();
  const { user } = useAuth();
  const navigate = useNavigate();
  const turmaId = useTurmaDetail().turmaId;

  if (isLoading || !turma) {
    return (
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
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return <SalaView isFollower={isMember} />;
};

const TurmaDetail = () => (
  <TurmaDetailProvider>
    <TurmaDetailInner />
  </TurmaDetailProvider>
);

export default TurmaDetail;
