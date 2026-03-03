import { useLocation } from 'react-router-dom';
import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';
import { TagInput } from '@/components/TagInput';
import { useDeckTags, useDeckTagMutations } from '@/hooks/useTags';
import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings } from 'lucide-react';

const DeckDetailContent = () => {
  const { deck, deckLoading, allCardsLoading, deckId, navigate, toast, setAlgorithmModalOpen } = useDeckDetail();
  const location = useLocation();
  const fromCommunity = (location.state as any)?.from === 'community';
  const communityTurmaId = (location.state as any)?.turmaId;

  if (deckLoading || allCardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

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
            </div>
          </div>
          <div className="flex items-center gap-2">
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
    </div>
  );
};

const DeckTagsSection = ({ deckId }: { deckId: string }) => {
  const { deck, decks } = useDeckDetail();
  const { data: tags = [] } = useDeckTags(deckId);
  const { addTag, removeTag } = useDeckTagMutations(deckId);

  // Check if this is a community-linked deck (imported from turma)
  const isLinkedDeck = (() => {
    if ((deck as any)?.source_turma_deck_id) return true;
    let parentId = (deck as any)?.parent_deck_id;
    while (parentId) {
      const parent = decks.find((d: any) => d.id === parentId);
      if (!parent) break;
      if ((parent as any).source_turma_deck_id) return true;
      parentId = (parent as any).parent_deck_id;
    }
    return false;
  })();

  // Find the source deck_id from turma_decks for suggestion context
  const sourceTurmaDeckId = (deck as any)?.source_turma_deck_id;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        Tags {isLinkedDeck && <span className="text-[10px] text-muted-foreground/60">(sugestões via comunidade)</span>}
      </p>
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
