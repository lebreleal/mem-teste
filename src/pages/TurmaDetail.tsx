/**
 * TurmaDetail page — Sala view for community/shared salas.
 * Uses the EXACT same layout as the Dashboard (matérias expand/collapse, classification bar).
 * Caderno de Erros is always filtered out (private per user).
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';
import { Button } from '@/components/ui/button';
import { ChevronDown as ChevronDownIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  ChevronLeft, Users, Star,
  Layers, Heart, FolderOpen, HelpCircle, Plus, Minus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';

interface PublishedDeck {
  turmaDeckId: string;
  deckId: string;
  name: string;
  cardCount: number;
  questionCount: number;
  parentDeckId: string | null;
}

/* ── Classification bar (same as DeckRow) ── */
const ClassificationBar = ({ facilPct, bomPct, dificilPct, erreiPct, novoPct, className = '' }: {
  facilPct: number; bomPct: number; dificilPct: number; erreiPct: number; novoPct: number; className?: string;
}) => (
  <div className={`relative h-1 w-full overflow-hidden rounded-full bg-muted/30 ${className}`}>
    <div className="absolute inset-y-0 left-0 flex w-full">
      {facilPct > 0 && <div className="h-full transition-all duration-500 rounded-l-full" style={{ width: `${facilPct}%`, backgroundColor: 'hsl(var(--info))' }} />}
      {bomPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${bomPct}%`, backgroundColor: 'hsl(var(--success))' }} />}
      {dificilPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${dificilPct}%`, backgroundColor: 'hsl(var(--warning))' }} />}
      {erreiPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${erreiPct}%`, backgroundColor: 'hsl(var(--destructive))' }} />}
      {novoPct > 0 && <div className="h-full bg-muted transition-all duration-500 rounded-r-full" style={{ width: `${novoPct}%` }} />}
    </div>
  </div>
);

// ─── Shared deck list + follow logic ───
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

  // Fetch published decks + their sub-decks
  const { data: publishedDecks = [], isLoading: decksLoading } = useQuery({
    queryKey: ['turma-published-decks', turmaId],
    queryFn: async () => {
      const { data: turmaDecks } = await supabase
        .from('turma_decks')
        .select('id, deck_id, is_published')
        .eq('turma_id', turmaId)
        .eq('is_published', true);
      if (!turmaDecks || turmaDecks.length === 0) return [];

      const rootDeckIds = turmaDecks.map((td: any) => td.deck_id);

      // Also fetch child decks (sub-decks of published decks)
      const { data: childDecks } = await supabase
        .from('decks')
        .select('id, name, parent_deck_id')
        .in('parent_deck_id', rootDeckIds)
        .eq('is_archived', false);

      const allChildIds = (childDecks ?? []).map((d: any) => d.id);
      const allDeckIds = [...rootDeckIds, ...allChildIds];

      const { data: decks } = await supabase
        .from('decks')
        .select('id, name, parent_deck_id')
        .in('id', allDeckIds);

      const { data: countRows } = await supabase.rpc('count_cards_per_deck', { p_deck_ids: allDeckIds });
      const countMap = new Map((countRows ?? []).map((r: any) => [r.deck_id, Number(r.card_count)]));
      const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d]));

      // Question counts
      const { data: qRows } = await supabase
        .from('deck_questions')
        .select('deck_id')
        .in('deck_id', allDeckIds);
      const qCountMap = new Map<string, number>();
      for (const r of qRows ?? []) {
        qCountMap.set(r.deck_id, (qCountMap.get(r.deck_id) ?? 0) + 1);
      }

      // Build results: root decks from turma_decks + their children
      const results: PublishedDeck[] = [];

      for (const td of turmaDecks) {
        const dk = deckMap.get(td.deck_id);
        if (!dk || dk.name?.includes('Caderno de Erros')) continue;
        results.push({
          turmaDeckId: td.id,
          deckId: td.deck_id,
          name: dk.name ?? 'Sem nome',
          cardCount: countMap.get(td.deck_id) ?? 0,
          questionCount: qCountMap.get(td.deck_id) ?? 0,
          parentDeckId: null, // root level in turma
        });
      }

      // Add child decks
      for (const child of (childDecks ?? [])) {
        if (child.name?.includes('Caderno de Erros')) continue;
        results.push({
          turmaDeckId: `child-${child.id}`,
          deckId: child.id,
          name: child.name ?? 'Sem nome',
          cardCount: countMap.get(child.id) ?? 0,
          questionCount: qCountMap.get(child.id) ?? 0,
          parentDeckId: child.parent_deck_id,
        });
      }

      return results;
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });

  // Check which decks user already downloaded (kept for potential future use)

    queryKey: ['turma-member-count', turmaId],
    queryFn: async () => {
      const { count } = await supabase.from('turma_members').select('id', { count: 'exact', head: true }).eq('turma_id', turmaId);
      return count ?? 0;
    },
    enabled: !!turmaId,
    staleTime: 60_000,
  });

  // Build hierarchy
  const { rootDecks, subDeckMap, aggregateStats } = useMemo(() => {
    const publishedIds = new Set(publishedDecks.map(d => d.deckId));
    const roots: PublishedDeck[] = [];
    const subs = new Map<string, PublishedDeck[]>();

    for (const deck of publishedDecks) {
      if (deck.parentDeckId && publishedIds.has(deck.parentDeckId)) {
        const list = subs.get(deck.parentDeckId) ?? [];
        list.push(deck);
        subs.set(deck.parentDeckId, list);
      } else {
        roots.push(deck);
      }
    }

    const stats = new Map<string, { cards: number; questions: number; subCount: number }>();
    for (const root of roots) {
      const children = subs.get(root.deckId) ?? [];
      const totalCards = root.cardCount + children.reduce((s, c) => s + c.cardCount, 0);
      const totalQ = root.questionCount + children.reduce((s, c) => s + c.questionCount, 0);
      stats.set(root.deckId, { cards: totalCards, questions: totalQ, subCount: children.length });
    }

    return { rootDecks: roots, subDeckMap: subs, aggregateStats: stats };
  }, [publishedDecks]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Follow = join + create linked folder + download first deck
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
          .insert({ user_id: user.id, name: turma?.name || 'Sala', section: 'community', source_turma_id: turmaId } as any)
          .select().single();
        folderId = (newFolder as any)?.id ?? null;
      }

      if (publishedDecks.length > 0) {
        await downloadDeck(publishedDecks[0].turmaDeckId, publishedDecks[0].deckId, publishedDecks[0].name, folderId);
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

  const [downloadingDeck, setDownloadingDeck] = useState<string | null>(null);
  const handleDownloadDeck = useCallback(async (deck: PublishedDeck) => {
    if (!user) { navigate('/auth'); return; }
    setDownloadingDeck(deck.turmaDeckId);
    try {
      if (!isMember) {
        await supabase.from('turma_members').insert({ turma_id: turmaId, user_id: user.id } as any).single();
      }

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

  /* ── Download button for a deck ── */
  const DownloadBtn = ({ deck }: { deck: PublishedDeck }) => {
    const isDownloaded = downloadedDeckIds.has(deck.turmaDeckId);
    const isDownloading = downloadingDeck === deck.turmaDeckId;
    if (isDownloaded) {
      return (
        <span className="flex items-center gap-1 text-xs text-success font-medium shrink-0">
          <Check className="h-3.5 w-3.5" /> Baixado
        </span>
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5 shrink-0"
        disabled={isDownloading}
        onClick={(e) => { e.stopPropagation(); handleDownloadDeck(deck); }}
      >
        <Download className="h-3.5 w-3.5" />
        {isDownloading ? '...' : 'Baixar'}
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner — identical to Dashboard */}
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

      {/* Follow CTA for non-members */}
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

        {/* Deck list — EXACT same layout as Dashboard DeckRow */}
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
            {rootDecks.map((deck) => {
              const children = subDeckMap.get(deck.deckId) ?? [];
              const stats = aggregateStats.get(deck.deckId);
              const isMateria = children.length > 0;
              const isExpanded = expandedId === deck.deckId;
              const totalCards = stats?.cards ?? deck.cardCount;
              const totalQ = stats?.questions ?? deck.questionCount;

              // For simple decks (no children) — same as DeckRow loose deck
              if (!isMateria) {
                return (
                  <div
                    key={deck.turmaDeckId}
                    className="group flex items-center gap-3 px-4 py-4 transition-all hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-foreground truncate">{deck.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5">
                            <Layers className="h-3 w-3" />
                            {deck.cardCount}
                          </span>
                          {deck.questionCount > 0 && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <HelpCircle className="h-3 w-3" />
                                {deck.questionCount}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      {/* Classification bar placeholder — no user stats in public view */}
                      <ClassificationBar facilPct={0} bomPct={0} dificilPct={0} erreiPct={0} novoPct={100} className="mt-1.5" />
                    </div>
                    <DownloadBtn deck={deck} />
                  </div>
                );
              }

              // Matéria (parent deck with sub-decks) — same as DeckRow with children
              return (
                <div key={deck.turmaDeckId}>
                  <div
                    className="group flex items-center gap-3 px-4 py-4 cursor-pointer transition-all hover:bg-muted/50"
                    onClick={() => setExpandedId(isExpanded ? null : deck.deckId)}
                  >
                    {/* +/- expand icon — same as Dashboard */}
                    {isExpanded
                      ? <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    }

                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-foreground truncate">{deck.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span>{children.length} {children.length === 1 ? 'deck' : 'decks'}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5">
                            <Layers className="h-3 w-3" />
                            {totalCards}
                          </span>
                          {totalQ > 0 && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <HelpCircle className="h-3 w-3" />
                                {totalQ}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <ClassificationBar facilPct={0} bomPct={0} dificilPct={0} erreiPct={0} novoPct={100} className="mt-1.5" />
                    </div>

                    {/* Download all button visible when expanded */}
                    {isExpanded && <DownloadBtn deck={deck} />}
                  </div>

                  {/* Sub-decks (expanded) — same as DeckRow sub-decks */}
                  {isExpanded && (
                    <div className="bg-muted/30">
                      {children.map(sub => (
                        <div
                          key={sub.turmaDeckId}
                          className="group/sub flex items-center gap-3 pl-10 pr-4 py-3 transition-colors hover:bg-muted/50 border-t border-border/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium text-foreground truncate">{sub.name}</h4>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                                <Layers className="h-3 w-3" />
                                {sub.cardCount}
                              </span>
                              {sub.questionCount > 0 && (
                                <>
                                  <span className="text-[11px] text-muted-foreground">·</span>
                                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                                    <HelpCircle className="h-3 w-3" />
                                    {sub.questionCount}
                                  </span>
                                </>
                              )}
                            </div>
                            <ClassificationBar facilPct={0} bomPct={0} dificilPct={0} erreiPct={0} novoPct={100} className="mt-1" />
                          </div>
                          <DownloadBtn deck={sub} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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

  if (!user) {
    navigate(`/c/${turma.share_slug || turmaId}`, { replace: true });
    return null;
  }

  return <SalaView isFollower={isMember} />;
};

const TurmaDetail = () => (
  <TurmaDetailProvider>
    <TurmaDetailInner />
  </TurmaDetailProvider>
);

export default TurmaDetail;
