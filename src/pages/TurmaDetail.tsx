/**
 * TurmaDetail page — Public/community Sala view.
 * Reuses the EXACT same DeckRow component from the Dashboard in readOnly mode.
 * No data duplication — reads the owner's decks directly via turma_decks RLS.
 */
// @ts-ignore
import { formatDistanceToNow } from 'date-fns';
// @ts-ignore
import { ptBR } from 'date-fns/locale';

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, Star, FolderOpen, Share2, Play, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import DeckRow from '@/components/dashboard/DeckRow';
import type { DeckWithStats } from '@/types/deck';

/**
 * Fetches the owner's published decks (+ their sub-decks) as DeckWithStats,
 * reading directly from the owner's data via turma_decks RLS.
 */
function useSalaDecks(turmaId: string) {
  return useQuery<DeckWithStats[]>({
    queryKey: ['sala-decks', turmaId],
    queryFn: async () => {
      const { data: turmaDecks } = await supabase
        .from('turma_decks')
        .select('id, deck_id, is_published')
        .eq('turma_id', turmaId)
        .eq('is_published', true);

      if (!turmaDecks || turmaDecks.length === 0) return [];

      const rootDeckIds = turmaDecks.map((td: any) => td.deck_id);

      const { data: childDecks } = await supabase
        .from('decks')
        .select('id')
        .in('parent_deck_id', rootDeckIds)
        .eq('is_archived', false);

      const allDeckIds = [...rootDeckIds, ...(childDecks ?? []).map((d: any) => d.id)];

      const { data: decks } = await supabase
        .from('decks')
        .select('*')
        .in('id', allDeckIds);

      if (!decks) return [];

      // Fetch card stats
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
  const { turma, turmaId } = ctx;
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

  // Last updated date from deck data
  const lastUpdated = useMemo(() => {
    if (salaDecks.length === 0) return null;
    let latest = '';
    for (const d of salaDecks) {
      if (d.updated_at && d.updated_at > latest) latest = d.updated_at;
    }
    return latest || null;
  }, [salaDecks]);

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

  // Aggregated stats
  const totalStats = useMemo(() => {
    let totalCards = 0, mastered = 0, novo = 0, facil = 0, bom = 0, dificil = 0, errei = 0, totalQuestions = 0;
    for (const d of salaDecks) {
      totalCards += d.total_cards;
      mastered += d.mastered_cards;
      novo += d.class_novo ?? 0;
      facil += d.class_facil ?? 0;
      bom += d.class_bom ?? 0;
      dificil += d.class_dificil ?? 0;
      errei += d.class_errei ?? 0;
    }
    if (questionCountMap) {
      for (const c of questionCountMap.values()) totalQuestions += c;
    }
    const progressPct = totalCards > 0 ? Math.round(((totalCards - novo) / totalCards) * 100) : 0;
    return { totalCards, mastered, novo, facil, bom, dificil, errei, totalQuestions, progressPct };
  }, [salaDecks, questionCountMap]);

  // DeckRow helpers
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

  const noopDeck = useCallback((_d: DeckWithStats) => {}, []);
  const noopStr = useCallback((_s: string) => {}, []);
  const getCommunityLinkId = useCallback((_d: DeckWithStats) => null as string | null, []);

  const [expandedDecks] = useState(new Set<string>());
  const [expandedAccordionId, setExpandedAccordionId] = useState<string | null>(null);

  // Follow handler
  const handleFollow = async () => {
    if (!user) { navigate('/auth'); return; }
    setFollowing(true);
    try {
      await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any);
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

  // Share handler
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: turma?.name || 'Sala', url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado!' });
    }
  };

  // Study handler — auto-follow + navigate to first deck with cards
  const handleStudy = async () => {
    if (!user) { navigate('/auth'); return; }
    // Auto-follow if not already a follower
    if (!isFollower) {
      try {
        await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any);
        const { data: existingFolders } = await supabase.from('folders')
          .select('id').eq('user_id', user.id).eq('source_turma_id', turmaId);
        if (!existingFolders || existingFolders.length === 0) {
          await supabase.from('folders')
            .insert({ user_id: user.id, name: turma?.name || 'Sala', section: 'community', source_turma_id: turmaId } as any);
        }
        queryClient.invalidateQueries({ queryKey: ['turma-role', turmaId, user.id] });
        queryClient.invalidateQueries({ queryKey: ['turma-members', turmaId] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        toast({ title: '✅ Sala adicionada ao seu menu Início!' });
      } catch (e: any) {
        if (e.code !== '23505') {
          toast({ title: 'Erro ao entrar na sala', variant: 'destructive' });
        }
      }
    }
    const firstWithCards = salaDecks.find(d => d.total_cards > 0 && !salaDecks.some(s => s.parent_deck_id === d.id));
    if (firstWithCards) {
      navigate(`/decks/${firstWithCards.id}`, { state: { from: 'community', turmaId } });
    } else if (rootDecks.length > 0) {
      navigate(`/decks/${rootDecks[0].id}`, { state: { from: 'community', turmaId } });
    }
  };

  // Classification bar for overall progress
  const overallBarPcts = useMemo(() => {
    const t = totalStats.totalCards;
    if (t === 0) return { facilPct: 0, bomPct: 0, dificilPct: 0, erreiPct: 0, novoPct: 100 };
    return {
      facilPct: (totalStats.facil / t) * 100,
      bomPct: (totalStats.bom / t) * 100,
      dificilPct: (totalStats.dificil / t) * 100,
      erreiPct: (totalStats.errei / t) * 100,
      novoPct: (totalStats.novo / t) * 100,
    };
  }, [totalStats]);

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
            <button
              onClick={handleShare}
              className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Compartilhar"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <img src={coverUrl || defaultSalaIcon} alt={turma?.name} className="h-14 w-14 rounded-xl object-cover border border-border/30 shadow-sm" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-display font-bold text-foreground truncate">{turma?.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">Por</span>
                <span className="text-xs font-medium text-foreground">{ownerName}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                {ratingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-warning fill-warning" /> {rating.toFixed(1)}
                  </span>
                )}
                {turma?.created_at && (
                  <span className="flex items-center gap-1">
                    <RefreshCw className="h-2.5 w-2.5" />
                    {(() => { try { return formatDistanceToNow(new Date(turma.created_at), { addSuffix: true, locale: ptBR }); } catch { return ''; } })()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          {!decksLoading && totalStats.totalCards > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
              <span>{rootDecks.length} {rootDecks.length === 1 ? 'deck' : 'decks'}</span>
              <span>{totalStats.totalCards} {totalStats.totalCards === 1 ? 'cartão' : 'cartões'}</span>
              {totalStats.totalQuestions > 0 && (
                <span>{totalStats.totalQuestions} {totalStats.totalQuestions === 1 ? 'questão' : 'questões'}</span>
              )}
            </div>
          )}


          {/* Study + Entrar buttons */}
          <div className="flex items-center gap-3 mt-3 px-1">
            {!isFollower && (
              <button
                onClick={handleFollow}
                disabled={following}
                className="flex flex-col items-center gap-0.5 shrink-0"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-warning text-warning-foreground">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-[9px] font-bold text-warning uppercase">Entrar</span>
              </button>
            )}
            {totalStats.totalCards > 0 && (
              <button
                onClick={handleStudy}
                className="flex-1 h-11 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <span>ESTUDAR</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-foreground/20">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <main className="pb-24">
        {turma?.description && (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{turma.description}</p>
          </div>
        )}

        {/* Deck list */}
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
          <div className="px-4 pt-3">
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
                readOnlyNavState={{ from: 'community', turmaId }}
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
