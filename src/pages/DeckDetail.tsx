import { useState, useMemo, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';
import { TagInput } from '@/components/TagInput';
import { useDeckTags, useDeckTagMutations } from '@/hooks/useTags';
import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, Layers, RefreshCw, Pencil, Check } from 'lucide-react';
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
      const sourceTurmaDeckId = (deck as any)?.source_turma_deck_id;
      let sourceDeckId: string | null = null;

      if (sourceTurmaDeckId) {
        const { data: td } = await supabase
          .from('turma_decks')
          .select('deck_id')
          .eq('id', sourceTurmaDeckId)
          .maybeSingle();
        sourceDeckId = td?.deck_id ?? null;
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
        <CardList />
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

const DeckTagsSection = ({ deckId }: { deckId: string }) => {
  const { deck, decks } = useDeckDetail();
  const { data: tags = [] } = useDeckTags(deckId);
  const { addTag, removeTag } = useDeckTagMutations(deckId);

  // Check if this is a community-linked deck (imported from turma or public follow)
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

  // Linked decks: show tags read-only, no editing
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
        aiContext={{ deckName: (deck as any)?.name }}
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
