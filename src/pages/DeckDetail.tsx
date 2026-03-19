import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DeckWithStats } from '@/types/deck';
import type { Tables } from '@/integrations/supabase/types';
import defaultSalaIcon from '@/assets/default-sala-icon.jpg';
import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';

import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Settings, Layers, RefreshCw, Pencil, Check, MessageSquare, HelpCircle, ChevronRight, BookOpen, SquarePlus, RotateCcw, CheckCircle2, Info, Clock, Play } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { calculateRealStudyTime, DEFAULT_STUDY_METRICS } from '@/lib/studyUtils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLinkedDeckSource, fetchPendingSuggestions, countPendingSuggestions } from '@/services/deck/deckCrud';
import { fetchFolderImageUrl } from '@/services/folderService';
import { toast } from '@/hooks/use-toast';


/** Detect if a deck is linked to a community/marketplace source (including linked ancestors) */
interface LinkableDeck {
  source_turma_deck_id?: string | null;
  source_listing_id?: string | null;
  is_live_deck?: boolean;
  parent_deck_id?: string | null;
  id: string;
}

function checkIsLinkedDeck(deck: LinkableDeck | null | undefined, deckMap: Map<string, LinkableDeck>): boolean {
  if (!deck) return false;
  if (deck.source_turma_deck_id || deck.source_listing_id || deck.is_live_deck) return true;
  let parentId = deck.parent_deck_id;
  while (parentId) {
    const parent = deckMap.get(parentId);
    if (!parent) break;
    if (parent.source_turma_deck_id || parent.source_listing_id || parent.is_live_deck) return true;
    parentId = parent.parent_deck_id;
  }
  return false;
}

// resolveSourceDeckId removed — now handled by fetchLinkedDeckSource in deckCrud service




const DeckDetailContent = () => {
  const { deck, deckLoading, allCardsLoading, deckId, navigate, toast, setAlgorithmModalOpen, cardCounts, decks } = useDeckDetail();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locState = location.state as { from?: string; folderId?: string; turmaId?: string } | null;
  const fromCommunity = locState?.from === 'community';
  const fromDashboardSala = locState?.from === 'dashboard-sala';
  const dashboardSalaFolderId = locState?.folderId;
  const communityTurmaId = locState?.turmaId;
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [activeTab, setActiveTab] = useState('cards');

  const deckMap = useMemo(() => new Map(decks.map(d => [d.id, d])), [decks]);

  const isLinkedDeck = useMemo(() => checkIsLinkedDeck(deck, deckMap), [deck, deckMap]);

  // Resolve folder image for blurred hero background
  const folderImage = useMemo(() => {
    if (!deck) return null;
    let folderId = deck.folder_id;
    if (!folderId && deck.parent_deck_id) {
      let currentDeck = deckMap.get(deck.parent_deck_id);
      while (currentDeck?.parent_deck_id) {
        currentDeck = deckMap.get(currentDeck.parent_deck_id);
      }
      folderId = currentDeck?.folder_id ?? null;
    }
    return folderId;
  }, [deck, deckMap]);

  const { data: folderImageUrl } = useQuery({
    queryKey: ['folder-image', folderImage],
    queryFn: () => fetchFolderImageUrl(folderImage!),
    enabled: !!folderImage,
    staleTime: 300_000,
  });

  // Resolve back destination: folder name for label
  const backInfo = useMemo(() => {
    if (fromDashboardSala && dashboardSalaFolderId) return { label: 'Sala', path: `/dashboard?folder=${dashboardSalaFolderId}` };
    if (fromCommunity && communityTurmaId) return { label: 'Sala', path: `/turmas/${communityTurmaId}` };
    let folderId = deck?.folder_id ?? null;
    if (!folderId && deck?.parent_deck_id && decks) {
      let currentDeck: DeckWithStats | undefined = decks.find(d => d.id === deck.parent_deck_id);
      while (currentDeck?.parent_deck_id) {
        currentDeck = decks.find(d => d.id === currentDeck!.parent_deck_id);
      }
      folderId = currentDeck?.folder_id ?? null;
    }
    if (folderId) return { label: 'Sala', path: `/dashboard?folder=${folderId}` };
    return { label: 'Dashboard', path: '/dashboard' };
  }, [deck, decks, fromCommunity, fromDashboardSala, dashboardSalaFolderId, communityTurmaId]);

  const { data: sourceData } = useQuery({
    queryKey: ['linked-deck-source', deckId],
    queryFn: () => fetchLinkedDeckSource(deck),
    enabled: isLinkedDeck && !!deck,
    staleTime: 120_000,
  });

  const handleRename = async () => {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === deck?.name) { setIsRenaming(false); return; }
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
  const deckName = deck?.name ?? 'Baralho';

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
              {!isLinkedDeck && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/decks/${deckId}/settings`)}>
                  <Settings className="h-4 w-4" />
                </Button>
              )}
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
                  {deck?.algorithm_mode === 'quick_review' ? 'Revisão Rápida' : 'FSRS-6'}
                </span>
              </button>
            )}
          </div>

          {/* DeckStatsCard – time estimate + study bar */}
          <DeckStatsCard mode="cards" />
        </div>
      </div>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {isLinkedDeck ? (
          <LinkedDeckTabs deckId={deckId!} resolvedSourceDeckId={sourceData?.sourceDeckId ?? null} isLinkedDeck={isLinkedDeck} activeTab={activeTab} setActiveTab={setActiveTab} />
        ) : (
          <PersonalDeckTabs deckId={deckId!} isLinkedDeck={isLinkedDeck} activeTab={activeTab} setActiveTab={setActiveTab} />
        )}
      </main>

      <DeckDetailDialogs />

    </div>
  );
};

/** Tabs component for linked decks: Cards + Questões + Sugestões */
const LinkedDeckTabs = ({ deckId, resolvedSourceDeckId, isLinkedDeck, activeTab, setActiveTab }: { deckId: string; resolvedSourceDeckId: string | null; isLinkedDeck: boolean; activeTab: string; setActiveTab: (v: string) => void }) => {
  const { cardCounts } = useDeckDetail();
  const effectiveDeckId = resolvedSourceDeckId ?? deckId;

  const { data: suggestionCount = 0 } = useQuery({
    queryKey: ['suggestion-count', effectiveDeckId],
    queryFn: () => countPendingSuggestions(effectiveDeckId),
    enabled: !!effectiveDeckId,
    staleTime: 60_000,
  });


  const totalCards = cardCounts?.total ?? 0;
  const [questionAction, setQuestionAction] = useState<'practice' | 'ai' | null>(null);

  useEffect(() => {
    const handler = () => { setQuestionAction('practice'); setActiveTab('questions'); };
    window.addEventListener('start-question-practice', handler);
    return () => window.removeEventListener('start-question-practice', handler);
  }, [setActiveTab]);

  return (
    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); }} className="w-full">
      <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
        <TabsTrigger value="cards" className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
          <Layers className="h-4 w-4" /> Cards ({totalCards})
        </TabsTrigger>
        <TabsTrigger value="suggestions" className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
          <MessageSquare className="h-4 w-4" /> Sugestões ({suggestionCount})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="cards" className="mt-4">
        <CardList />
      </TabsContent>
      <TabsContent value="suggestions" className="mt-4">
        <SuggestionsList deckId={effectiveDeckId} />
      </TabsContent>
    </Tabs>
  );
};

const PersonalDeckTabs = ({ deckId, isLinkedDeck, activeTab, setActiveTab }: { deckId: string; isLinkedDeck: boolean; activeTab: string; setActiveTab: (v: string) => void }) => {
  const { cardCounts } = useDeckDetail();
  const totalCards = cardCounts?.total ?? 0;

  return (
    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); }} className="w-full">
      <TabsContent value="cards" className="mt-4">
        <CardList />
      </TabsContent>
    </Tabs>
  );
};

/** List of suggestions for a deck */
const SuggestionsList = ({ deckId }: { deckId: string }) => {
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['deck-suggestions-list', deckId],
    queryFn: () => fetchPendingSuggestions(deckId),
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
          {s.suggestion_type === 'card' && s.suggested_content && (() => {
            const sc = s.suggested_content as Record<string, unknown>;
            return (
              <div className="text-xs text-muted-foreground/70">
                {sc.front_content && <span className="text-primary">Frente editada</span>}
                {sc.front_content && sc.back_content && ' · '}
                {sc.back_content && <span className="text-primary">Verso editado</span>}
              </div>
            );
          })()}
          {s.suggestion_type === 'deck' && (s.suggested_content as Record<string, unknown>)?.new_card && (
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
