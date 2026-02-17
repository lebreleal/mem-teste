import { DeckDetailProvider, useDeckDetail } from '@/components/deck-detail/DeckDetailContext';
import DeckStatsCard from '@/components/deck-detail/DeckStatsCard';
import CardList from '@/components/deck-detail/CardList';
import DeckDetailDialogs from '@/components/deck-detail/DeckDetailDialogs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, Crown } from 'lucide-react';

const DeckDetailContent = () => {
  const { deck, deckLoading, allCardsLoading, deckId, navigate, toast, setAlgorithmModalOpen } = useDeckDetail();

  if (deckLoading || allCardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard', { replace: true })}>
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
                  {(deck as any)?.algorithm_mode === 'quick_review' ? 'Revisão Rápida' : (deck as any)?.algorithm_mode === 'fsrs' ? (
                    <>FSRS-4.5 <Crown className="inline h-3 w-3 text-amber-500 ml-0.5 -mt-0.5" /></>
                  ) : 'SM-2'}
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
        <CardList />
      </main>

      <DeckDetailDialogs />
    </div>
  );
};

const DeckDetail = () => (
  <DeckDetailProvider>
    <DeckDetailContent />
  </DeckDetailProvider>
);

export default DeckDetail;
