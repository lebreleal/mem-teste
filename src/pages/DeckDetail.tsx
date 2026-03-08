import { useState, useMemo, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';
import { TagInput } from '@/components/TagInput';
import { useDeckTags, useDeckTagMutations } from '@/hooks/useTags';
import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Settings, Layers, RefreshCw, Pencil, Check, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const SuggestCorrectionModal = lazy(() => import('@/components/SuggestCorrectionModal'));

const DeckDetailContent = () => {
  const { deck, deckLoading, allCardsLoading, deckId, navigate, toast, setAlgorithmModalOpen, cardCounts, decks } = useDeckDetail();
  const location = useLocation();
  const fromCommunity = (location.state as any)?.from === 'community';
  const communityTurmaId = (location.state as any)?.turmaId;
  const [suggestOpen, setSuggestOpen] = useState(false);

  // Detect linked community deck
  const isLinkedDeck = useMemo(() => {
    if (!deck) return false;
    if ((deck as any)?.source_turma_deck_id || (deck as any)?.source_listing_id || (deck as any)?.is_live_deck) return true;
    let parentId = (deck as any)?.parent_deck_id;
    while (parentId) {
      const parent = decks.find((d: any) => d.id === parentId);
      if (!parent) break;
      if ((parent as any).source_turma_deck_id || (parent as any).source_listing_id || (parent as any).is_live_deck) return true;
      parentId = (parent as any).parent_deck_id;
    }
    return false;
  }, [deck, decks]);

  // Fetch source deck owner info for linked decks
  const { data: sourceInfo } = useQuery({
    queryKey: ['linked-deck-source-info', deckId],
    queryFn: async () => {
      let sourceDeckId: string | null = null;
      const sourceTurmaDeckId = (deck as any)?.source_turma_deck_id;
      const sourceListingId = (deck as any)?.source_listing_id;

      // 1) Via turma_decks
      if (sourceTurmaDeckId) {
        const { data: td } = await supabase
          .from('turma_decks')
          .select('deck_id')
          .eq('id', sourceTurmaDeckId)
          .maybeSingle();
        sourceDeckId = td?.deck_id ?? null;
      }

      // 2) Via marketplace listing
      if (!sourceDeckId && sourceListingId) {
        const { data: listing } = await supabase
          .from('marketplace_listings')
          .select('deck_id')
          .eq('id', sourceListingId)
          .maybeSingle();
        sourceDeckId = listing?.deck_id ?? null;
      }

      // 3) Fallback: is_live_deck by name match
      if (!sourceDeckId && (deck as any)?.is_live_deck) {
        const { data: original } = await supabase
          .from('decks')
          .select('id')
          .eq('name', (deck as any).name)
          .eq('is_public', true)
          .neq('user_id', (deck as any).user_id)
          .limit(1)
          .maybeSingle();
        sourceDeckId = original?.id ?? null;
      }

      if (!sourceDeckId) return null;

      const { data: sourceDeck } = await supabase
        .from('decks')
        .select('user_id, updated_at')
        .eq('id', sourceDeckId)
        .single();

      if (!sourceDeck) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', sourceDeck.user_id)
        .single();

      return {
        ownerName: profile?.name ?? 'Criador',
        updatedAt: sourceDeck.updated_at,
      };
    },
    enabled: isLinkedDeck && !!deck,
    staleTime: 60_000,
  });

  if (deckLoading || allCardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalCards = cardCounts?.total ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 gap-2 overflow-hidden">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={() => fromCommunity && communityTurmaId ? navigate(`/turmas/${communityTurmaId}`, { replace: true }) : navigate('/dashboard', { replace: true })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-base sm:text-xl font-bold text-foreground truncate">
                {(deck as any)?.name ?? 'Baralho'}
              </h1>
              {isLinkedDeck && sourceInfo ? (
                <p className="text-[11px] text-muted-foreground">
                  por <span className="font-semibold text-foreground">{sourceInfo.ownerName}</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {totalCards} cards
                  </span>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw className="h-2.5 w-2.5" />
                    {formatDistanceToNow(new Date(sourceInfo.updatedAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </p>
              ) : (
                <button
                  onClick={() => {
                    if ((deck as any)?.parent_deck_id) {
                      toast({ title: 'Algoritmo herdado', description: 'Este sub-baralho herda o algoritmo do baralho pai. Altere pelo pai.' });
                      return;
                    }
                    setAlgorithmModalOpen(true);
                  }}
                  className="text-xs cursor-pointer transition-colors hover:underline"
                >
                  <span className="text-foreground">Algoritmo:</span>{' '}
                  <span className="font-medium text-info">
                    {(deck as any)?.algorithm_mode === 'quick_review' ? 'Revisão Rápida' : 'FSRS-6'}
                  </span>
                </button>
              )}
            </div>
          </div>
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
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 shrink-0" onClick={() => navigate(`/decks/${deckId}/settings`)}>
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        <DeckStatsCard />
        <DeckTagsSection deckId={deckId!} />
        {isLinkedDeck ? (
          <LinkedDeckTabs deckId={deckId!} />
        ) : (
          <CardList />
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

/** Tabs component for linked decks: Cards + Sugestões */
const LinkedDeckTabs = ({ deckId }: { deckId: string }) => {
  const { deck, decks, cardCounts } = useDeckDetail();

  // Resolve the original deck ID for fetching suggestions
  const { data: resolvedDeckId } = useQuery({
    queryKey: ['resolved-deck-id', deckId],
    queryFn: async () => {
      const { data } = await supabase
        .from('decks')
        .select('source_turma_deck_id, source_listing_id, is_live_deck, name, user_id')
        .eq('id', deckId)
        .single();
      if (!data) return deckId;

      if (data.source_turma_deck_id) {
        const { data: td } = await supabase.from('turma_decks').select('deck_id').eq('id', data.source_turma_deck_id).maybeSingle();
        if (td?.deck_id) return td.deck_id;
      }
      if (data.source_listing_id) {
        const { data: listing } = await supabase.from('marketplace_listings').select('deck_id').eq('id', data.source_listing_id).maybeSingle();
        if (listing?.deck_id) return listing.deck_id;
      }
      if (data.is_live_deck) {
        const { data: original } = await supabase.from('decks').select('id').eq('name', data.name).eq('is_public', true).neq('user_id', data.user_id).limit(1).maybeSingle();
        if (original?.id) return original.id;
      }
      return deckId;
    },
    staleTime: 120_000,
  });

  const { data: suggestionCount = 0 } = useQuery({
    queryKey: ['suggestion-count', resolvedDeckId],
    queryFn: async () => {
      if (!resolvedDeckId) return 0;
      const { count } = await supabase
        .from('deck_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('deck_id', resolvedDeckId)
        .eq('status', 'pending');
      return count ?? 0;
    },
    enabled: !!resolvedDeckId,
    staleTime: 60_000,
  });

  const totalCards = cardCounts?.total ?? 0;

  return (
    <Tabs defaultValue="cards" className="w-full">
      <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
        <TabsTrigger
          value="cards"
          className="text-sm gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5"
        >
          <Layers className="h-4 w-4" /> Cards ({totalCards})
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
      <TabsContent value="suggestions" className="mt-4">
        <SuggestionsList deckId={resolvedDeckId ?? deckId} />
      </TabsContent>
    </Tabs>
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

const DeckTagsSection = ({ deckId }: { deckId: string }) => {
  const { deck, decks } = useDeckDetail();
  const { data: tags = [] } = useDeckTags(deckId);
  const { addTag, removeTag } = useDeckTagMutations(deckId);

  const isLinkedDeck = (() => {
    if ((deck as any)?.source_turma_deck_id) return true;
    if ((deck as any)?.source_listing_id) return true;
    if ((deck as any)?.is_live_deck) return true;
    let parentId = (deck as any)?.parent_deck_id;
    while (parentId) {
      const parent = decks.find((d: any) => d.id === parentId);
      if (!parent) break;
      if ((parent as any).source_turma_deck_id || (parent as any).source_listing_id || (parent as any).is_live_deck) return true;
      parentId = (parent as any).parent_deck_id;
    }
    return false;
  })();

  if (isLinkedDeck) {
    if (tags.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag: any) => (
            <span key={tag.id} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Tags</p>
      <TagInput
        tags={tags}
        onAdd={(tag) => addTag.mutate(tag)}
        onRemove={(tagId) => removeTag.mutate(tagId)}
        placeholder="Buscar ou criar tag..."
        
      />
    </div>
  );
};

const DeckDetail = () => (
  <DeckDetailProvider>
    <DeckDetailContent />
  </DeckDetailProvider>
);

export default DeckDetail;
