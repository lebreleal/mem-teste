import { useState, useMemo, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';
import QuestionStatsCard from '@/components/deck-detail/QuestionStatsCard';
import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Settings, Layers, RefreshCw, Pencil, Check, MessageSquare, HelpCircle, ChevronRight, BookOpen, SquarePlus, RotateCcw, Brain, CheckCircle2, Info, Clock, Play } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { deriveAvgSecondsPerCard, DEFAULT_STUDY_METRICS } from '@/lib/studyUtils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const SuggestCorrectionModal = lazy(() => import('@/components/SuggestCorrectionModal'));
const DeckQuestionsTab = lazy(() => import('@/components/deck-detail/DeckQuestionsTab'));

/** Detect if a deck is linked to a community/marketplace source */
function checkIsLinkedDeck(deck: any): boolean {
  if (!deck) return false;
  return !!(deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck);
}

/** Resolve source deck ID from a linked deck — single unified query */
async function resolveSourceDeckId(deck: any): Promise<string | null> {
  const sourceTurmaDeckId = deck?.source_turma_deck_id;
  const sourceListingId = deck?.source_listing_id;

  if (sourceTurmaDeckId) {
    const { data: td } = await supabase.from('turma_decks').select('deck_id').eq('id', sourceTurmaDeckId).maybeSingle();
    if (td?.deck_id) return td.deck_id;
  }

  if (sourceListingId) {
    const { data: listing } = await supabase.from('marketplace_listings').select('deck_id').eq('id', sourceListingId).maybeSingle();
    if (listing?.deck_id) return listing.deck_id;
  }

  if (deck?.is_live_deck) {
    const { data: original } = await supabase
      .from('decks').select('id')
      .eq('name', deck.name).eq('is_public', true).neq('user_id', deck.user_id)
      .limit(1).maybeSingle();
    if (original?.id) return original.id;
  }

  return null;
}

/** @deprecated Sub-deck list view — no longer used, kept temporarily for reference */
const _SubDeckList = ({ parentDeckId, subDecks, allDecks }: { parentDeckId: string; subDecks: any[]; allDecks: any[] }) => {
  const navigate = useNavigate();

  const getMastery = (deckId: string): { total: number; mastered: number } => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return { total: 0, mastered: 0 };
    let total = deck.total_cards ?? 0;
    let mastered = deck.mastered_cards ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) {
      const cm = getMastery(child.id);
      total += cm.total;
      mastered += cm.mastered;
    }
    return { total, mastered };
  };

  const getDueCount = (deckId: string): number => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return 0;
    let due = (deck.new_count ?? 0) + (deck.learning_count ?? 0) + (deck.review_count ?? 0);
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) due += getDueCount(child.id);
    return due;
  };

  const getNewCount = (deckId: string): number => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return 0;
    let n = deck.new_count ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) n += getNewCount(child.id);
    return n;
  };

  const getLearningCount = (deckId: string): number => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return 0;
    let l = deck.learning_count ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) l += getLearningCount(child.id);
    return l;
  };

  const getReviewCount = (deckId: string): number => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return 0;
    let r = deck.review_count ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) r += getReviewCount(child.id);
    return r;
  };

  // Apply parent deck governance: cap new cards by daily_new_limit
  const parentDeck = allDecks.find((d: any) => d.id === parentDeckId);
  const dailyNewLimit = parentDeck?.daily_new_limit ?? 20;
  const newReviewedToday = parentDeck?.new_reviewed_today ?? 0;
  // Also account for new_graduated_today from all children
  const getNewGraduatedToday = (deckId: string): number => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return 0;
    let n = deck.new_graduated_today ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) n += getNewGraduatedToday(child.id);
    return n;
  };
  const totalNewGraduatedToday = getNewGraduatedToday(parentDeckId);
  const totalNewReviewedToday = Math.max(newReviewedToday, totalNewGraduatedToday);

  const rawNew = getNewCount(parentDeckId);
  const remainingNewBudget = Math.max(0, dailyNewLimit - totalNewReviewedToday);
  const totalNew = Math.min(rawNew, remainingNewBudget);
  const totalLearning = getLearningCount(parentDeckId);
  const dailyReviewLimit = parentDeck?.daily_review_limit ?? 100;
  const rawReview = getReviewCount(parentDeckId);
  const totalReview = Math.min(rawReview, dailyReviewLimit);
  const totalDue = totalNew + totalLearning + totalReview;

  // Fetch question counts for all descendant deck IDs
  const allDescendantIds = useMemo(() => {
    const collect = (id: string): string[] => {
      const children = allDecks.filter(d => d.parent_deck_id === id && !d.is_archived);
      return [id, ...children.flatMap(c => collect(c.id))];
    };
    return collect(parentDeckId);
  }, [parentDeckId, allDecks]);

  const { data: questionCounts } = useQuery({
    queryKey: ['sub-deck-question-counts', parentDeckId],
    queryFn: async () => {
      const { data } = await supabase
        .from('deck_questions')
        .select('deck_id')
        .in('deck_id', allDescendantIds);
      const map = new Map<string, number>();
      if (data) {
        for (const q of data as any[]) {
          map.set(q.deck_id, (map.get(q.deck_id) ?? 0) + 1);
        }
      }
      return map;
    },
    enabled: allDescendantIds.length > 0,
    staleTime: 60_000,
  });

  const getQuestionCount = (deckId: string): number => {
    let count = questionCounts?.get(deckId) ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) count += getQuestionCount(child.id);
    return count;
  };

  const sorted = [...subDecks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

  // Compute reviewed today across hierarchy for progress
  const getReviewedToday = (deckId: string): number => {
    const deck = allDecks.find((d: any) => d.id === deckId);
    if (!deck) return 0;
    let r = deck.reviewed_today ?? 0;
    const children = allDecks.filter((d: any) => d.parent_deck_id === deckId && !d.is_archived);
    for (const child of children) r += getReviewedToday(child.id);
    return r;
  };
  const reviewedToday = getReviewedToday(parentDeckId);
  const totalSession = totalDue + reviewedToday;
  const progressPct = totalSession > 0 ? Math.round((reviewedToday / totalSession) * 100) : 0;

  // Estimated remaining time
  const avgSec = deriveAvgSecondsPerCard(DEFAULT_STUDY_METRICS);
  const remainingSeconds = totalDue * avgSec;
  const remainingMin = Math.ceil(remainingSeconds / 60);
  const timeLabel = remainingMin >= 60
    ? `${Math.floor(remainingMin / 60)}h${remainingMin % 60 > 0 ? `${remainingMin % 60}min` : ''}`
    : `${remainingMin}min`;

  return (
    <div className="space-y-4">
      {/* Compact study header */}
      <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Circular progress */}
          <div className="relative flex-shrink-0">
            <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
              <circle
                cx="28" cy="28" r="24" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 24}`}
                strokeDashoffset={`${2 * Math.PI * 24 * (1 - progressPct / 100)}`}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-foreground">{progressPct}%</span>
            </div>
          </div>

          {/* Counts inline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <SquarePlus className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm font-bold text-foreground">{totalNew}</span>
              </div>
              <div className="flex items-center gap-1">
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-bold text-foreground">{totalLearning}</span>
              </div>
              <div className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-bold text-foreground">{totalReview}</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-0.5 rounded-full hover:bg-muted/50 transition-colors">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" side="bottom" align="start">
                  <p className="text-xs font-semibold text-foreground mb-2">Detalhes do dia</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SquarePlus className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs text-muted-foreground">Novos</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{totalNew}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs text-muted-foreground">Aprendendo</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{totalLearning}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs text-muted-foreground">Revisão</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{totalReview}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2 mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Tempo estimado</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">~{timeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-xs text-muted-foreground">Feitos hoje</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{reviewedToday}</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">~{timeLabel}</span>
              {reviewedToday > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-green-500 font-medium">{reviewedToday} feitos</span>
                </>
              )}
            </div>
          </div>

          {/* Study button - circular icon only */}
          <Button
            onClick={() => navigate(`/study/${parentDeckId}`, { replace: true })}
            size="icon"
            className="h-10 w-10 rounded-full flex-shrink-0"
            disabled={totalDue === 0}
          >
            <Play className="h-5 w-5" />
          </Button>
        </div>

        {/* Full-width progress bar */}
        <Progress value={progressPct} className="h-1.5 mt-3" />
      </div>

      {/* Sub-deck list */}
      <div className="divide-y divide-border/50">
        {sorted.map(sub => {
          const mastery = getMastery(sub.id);
          const masteryPct = mastery.total > 0 ? Math.round((mastery.mastered / mastery.total) * 1000) / 10 : 0;
          const qCount = getQuestionCount(sub.id);
          const allCaughtUp = getDueCount(sub.id) === 0 && mastery.mastered > 0;

          return (
            <div
              key={sub.id}
              className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/decks/${sub.id}`)}
            >
              {allCaughtUp && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-semibold text-foreground truncate">{sub.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Layers className="h-3 w-3" />
                    {mastery.total}
                  </span>
                  {qCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <HelpCircle className="h-3 w-3" />
                      {qCount}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">{masteryPct}%</span>
                </div>
                <Progress value={masteryPct} className="h-1 mt-1.5" />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DeckDetailContent = () => {
  const { deck, deckLoading, allCardsLoading, deckId, navigate, toast, setAlgorithmModalOpen, cardCounts, decks } = useDeckDetail();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fromCommunity = (location.state as any)?.from === 'community';
  const communityTurmaId = (location.state as any)?.turmaId;
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');

  const isLinkedDeck = useMemo(() => checkIsLinkedDeck(deck), [deck]);

  // Resolve folder image for blurred hero background
  const folderImage = useMemo(() => {
    if (!deck || !decks) return null;
    let folderId = (deck as any)?.folder_id;
    if (!folderId && (deck as any)?.parent_deck_id) {
      let current = deck as any;
      while (current?.parent_deck_id) {
        current = decks.find((d: any) => d.id === current.parent_deck_id);
      }
      folderId = current?.folder_id;
    }
    return folderId;
  }, [deck, decks]);

  const { data: folderImageUrl } = useQuery({
    queryKey: ['folder-image', folderImage],
    queryFn: async () => {
      const { data } = await supabase.from('folders').select('image_url').eq('id', folderImage!).single();
      return data?.image_url ?? null;
    },
    enabled: !!folderImage,
    staleTime: 300_000,
  });

  // Resolve back destination: folder name for label
  const backInfo = useMemo(() => {
    if (fromCommunity && communityTurmaId) return { label: 'Turma', path: `/turmas/${communityTurmaId}` };
    let folderId = (deck as any)?.folder_id;
    if (!folderId && (deck as any)?.parent_deck_id && decks) {
      let current = deck as any;
      while (current?.parent_deck_id) {
        current = decks.find((d: any) => d.id === current.parent_deck_id);
      }
      folderId = current?.folder_id;
    }
    if (folderId) return { label: 'Sala', path: `/dashboard?folder=${folderId}` };
    return { label: 'Dashboard', path: '/dashboard' };
  }, [deck, decks, fromCommunity, communityTurmaId]);

  // Unified source resolution: resolves source deck ID, owner name, and updatedAt in one query
  const { data: sourceData } = useQuery({
    queryKey: ['linked-deck-source', deckId],
    queryFn: async () => {
      const sourceDeckId = await resolveSourceDeckId(deck);
      if (!sourceDeckId) return null;

      const [deckResult] = await Promise.all([
        supabase.from('decks').select('user_id, updated_at').eq('id', sourceDeckId).single(),
        Promise.resolve(null),
      ]);

      if (!deckResult.data) return { sourceDeckId, ownerName: 'Criador', updatedAt: null };

      const { data: profile } = await supabase.from('profiles').select('name').eq('id', deckResult.data.user_id).single();

      return {
        sourceDeckId,
        ownerName: profile?.name ?? 'Criador',
        updatedAt: deckResult.data.updated_at,
      };
    },
    enabled: isLinkedDeck && !!deck,
    staleTime: 120_000,
  });

  const handleRename = async () => {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === (deck as any)?.name) { setIsRenaming(false); return; }
    try {
      const { renameDeck } = await import('@/services/deckService');
      await renameDeck(deckId!, trimmed);
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({ title: 'Renomeado!' });
    } catch {
      toast({ title: 'Erro ao renomear', variant: 'destructive' });
    }
    setIsRenaming(false);
  };

  if (deckLoading || allCardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalCards = cardCounts?.total ?? 0;
  const deckName = (deck as any)?.name ?? 'Baralho';

  return (
    <div className="min-h-screen bg-background">
      {/* Hero banner */}
      <div className="relative bg-muted/50 overflow-hidden">
        {/* Blurred background image (same style as Sala) */}
        <div className="absolute inset-0">
          <img src={folderImageUrl || defaultSalaIcon} alt="" className="w-full h-full object-cover opacity-30 blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background" />
        </div>

        <div className="relative container mx-auto max-w-2xl px-4 pt-3 pb-4">
          {/* Top bar: back + actions */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate(backInfo.path, { replace: true })}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{backInfo.label}</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              {isLinkedDeck && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
                    Inscrito <Check className="h-3 w-3" />
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSuggestOpen(true)}
                    title="Sugerir correção"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/decks/${deckId}/settings`)}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Deck name + edit + algorithm */}
          <div className="mb-1">
            <div className="flex items-center gap-1.5">
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameName}
                  onChange={e => setRenameName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsRenaming(false); }}
                  className="text-lg font-display font-bold text-foreground bg-transparent border-b border-primary outline-none flex-1 min-w-0"
                />
              ) : (
                <>
                  <h1 className="text-lg font-display font-bold text-foreground truncate">{deckName}</h1>
                  {!isLinkedDeck && (
                    <button
                      onClick={() => { setRenameName(deckName); setIsRenaming(true); }}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
            {isLinkedDeck && sourceData ? (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                por <span className="font-semibold text-foreground">{sourceData.ownerName}</span>
                <span className="mx-1.5 text-border">·</span>
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {totalCards} cards
                </span>
                {sourceData.updatedAt && (
                  <>
                    <span className="mx-1.5 text-border">·</span>
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="h-2.5 w-2.5" />
                      {formatDistanceToNow(new Date(sourceData.updatedAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </>
                )}
              </p>
            ) : (
              <button
                onClick={() => setAlgorithmModalOpen(true)}
                className="text-xs cursor-pointer transition-colors hover:underline mt-0.5"
              >
                <span className="text-foreground">Algoritmo:</span>{' '}
                <span className="font-medium text-info">
                  {(deck as any)?.algorithm_mode === 'quick_review' ? 'Revisão Rápida' : 'FSRS-6'}
                </span>
              </button>
            )}
          </div>

          {/* DeckStatsCard – time estimate + study bar */}
          <DeckStatsCard />
        </div>
      </div>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {isLinkedDeck ? (
          <LinkedDeckTabs deckId={deckId!} resolvedSourceDeckId={sourceData?.sourceDeckId ?? null} isLinkedDeck={isLinkedDeck} />
        ) : (
          <PersonalDeckTabs deckId={deckId!} isLinkedDeck={isLinkedDeck} />
        )}
      </main>

      <DeckDetailDialogs />

      {suggestOpen && (
        <Suspense fallback={null}>
          <SuggestCorrectionModal
            open={suggestOpen}
            onOpenChange={setSuggestOpen}
            deckId={deckId!}
          />
        </Suspense>
      )}
    </div>
  );
};

/** Tabs component for linked decks: Cards + Questões + Sugestões */
const LinkedDeckTabs = ({ deckId, resolvedSourceDeckId, isLinkedDeck }: { deckId: string; resolvedSourceDeckId: string | null; isLinkedDeck: boolean }) => {
  const { cardCounts } = useDeckDetail();
  const effectiveDeckId = resolvedSourceDeckId ?? deckId;
  const [activeTab, setActiveTab] = useState('cards');

  const { data: suggestionCount = 0 } = useQuery({
    queryKey: ['suggestion-count', effectiveDeckId],
    queryFn: async () => {
      const { count } = await supabase
        .from('deck_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', effectiveDeckId)
        .eq('status', 'pending');
      return count ?? 0;
    },
    enabled: !!effectiveDeckId,
    staleTime: 60_000,
  });

  const { data: questionCount = 0 } = useQuery({
    queryKey: ['deck-questions-count', effectiveDeckId],
    queryFn: async () => {
      const { count } = await supabase
        .from('deck_questions' as any)
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', effectiveDeckId);
      return count ?? 0;
    },
    enabled: !!effectiveDeckId,
    staleTime: 60_000,
  });

  const totalCards = cardCounts?.total ?? 0;

  const [questionAction, setQuestionAction] = useState<'practice' | 'ai' | null>(null);

  return (
    <>
      {activeTab === 'cards' && <DeckStatsCard />}
      {activeTab === 'questions' && (
        <QuestionStatsCard
          deckId={deckId}
          sourceDeckId={resolvedSourceDeckId}
          isReadOnly
          onPractice={() => setQuestionAction('practice')}
          onCreateAI={() => setQuestionAction('ai')}
        />
      )}
      
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setQuestionAction(null); }} className="w-full">
        <TabsList className="w-full grid grid-cols-3 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
          <TabsTrigger
            value="cards"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <Layers className="h-4 w-4" /> Cards ({totalCards})
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <HelpCircle className="h-4 w-4" /> Questões ({questionCount})
          </TabsTrigger>
          <TabsTrigger
            value="suggestions"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <MessageSquare className="h-4 w-4" /> Sugestões ({suggestionCount})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cards" className="mt-4">
          <CardList />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <Suspense fallback={null}>
            <DeckQuestionsTab
              deckId={deckId}
              isReadOnly
              sourceDeckId={effectiveDeckId}
              autoStart={questionAction === 'practice'}
              autoCreate={questionAction === 'ai' ? 'ai' : null}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="suggestions" className="mt-4">
          <SuggestionsList deckId={effectiveDeckId} />
        </TabsContent>
      </Tabs>
    </>
  );
};

const PersonalDeckTabs = ({ deckId, isLinkedDeck }: { deckId: string; isLinkedDeck: boolean }) => {
  const { cardCounts } = useDeckDetail();
  const totalCards = cardCounts?.total ?? 0;
  const [activeTab, setActiveTab] = useState('cards');
  const [questionAction, setQuestionAction] = useState<'practice' | 'ai' | null>(null);

  return (
    <>
      {activeTab === 'questions' && (
        <QuestionStatsCard
          deckId={deckId}
          onPractice={() => setQuestionAction('practice')}
          onCreateAI={() => setQuestionAction('ai')}
        />
      )}
      
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setQuestionAction(null); }} className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
          <TabsTrigger
            value="cards"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <Layers className="h-4 w-4" /> Cards ({totalCards})
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
          >
            <HelpCircle className="h-4 w-4" /> Questões
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cards" className="mt-4">
          <CardList />
        </TabsContent>
        <TabsContent value="questions" className="mt-4">
          <Suspense fallback={null}>
            <DeckQuestionsTab
              deckId={deckId}
              autoStart={questionAction === 'practice'}
              autoCreate={questionAction === 'ai' ? 'ai' : null}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
};

/** List of suggestions for a deck */
const SuggestionsList = ({ deckId }: { deckId: string }) => {
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['deck-suggestions-list', deckId],
    queryFn: async () => {
      const { data } = await supabase
        .from('deck_suggestions')
        .select('*')
        .eq('deck_id', deckId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!data || data.length === 0) return [];
      const userIds = [...new Set(data.map((s: any) => s.suggester_user_id))];
      const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: userIds });
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));
      return data.map((s: any) => ({ ...s, suggester_name: profileMap.get(s.suggester_user_id) ?? 'Anônimo' }));
    },
    enabled: !!deckId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <h3 className="font-display text-base font-semibold text-foreground">Nenhuma sugestão pendente</h3>
        <p className="mt-1 text-sm text-muted-foreground">As sugestões de correção aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s: any) => (
        <div key={s.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{s.suggester_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{s.rationale}</p>
          {s.suggestion_type === 'card' && s.suggested_content && (
            <div className="text-xs text-muted-foreground/70">
              {(s.suggested_content as any)?.front_content && <span className="text-primary">Frente editada</span>}
              {(s.suggested_content as any)?.front_content && (s.suggested_content as any)?.back_content && ' · '}
              {(s.suggested_content as any)?.back_content && <span className="text-primary">Verso editado</span>}
            </div>
          )}
          {s.suggestion_type === 'deck' && (s.suggested_content as any)?.new_card && (
            <span className="text-xs text-primary">Novo card sugerido</span>
          )}
          {s.suggested_tags && (
            <span className="text-xs text-primary">Tags modificadas</span>
          )}
        </div>
      ))}
    </div>
  );
};


const DeckDetail = () => (
  <DeckDetailProvider>
    <DeckDetailContent />
  </DeckDetailProvider>
);

export default DeckDetail;
