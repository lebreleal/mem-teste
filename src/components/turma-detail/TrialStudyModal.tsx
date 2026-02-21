import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, RotateCcw, CheckCircle2 } from 'lucide-react';
import FlashCard from '@/components/FlashCard';
import type { Rating } from '@/lib/fsrs';

interface TrialStudyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
}

const TrialStudyModal = ({ open, onOpenChange, deckId, deckName }: TrialStudyModalProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [cardKey, setCardKey] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['trial-cards', deckId],
    queryFn: async () => {
      const { data } = await supabase.from('cards')
        .select('id, front_content, back_content, card_type, stability, difficulty, state, scheduled_date, last_reviewed_at')
        .eq('deck_id', deckId);
      return data ?? [];
    },
    enabled: open && !!deckId,
  });

  const shuffled = useMemo(() => {
    if (!cards.length) return [];
    return [...cards].sort(() => Math.random() - 0.5);
  }, [cards]);

  const current = shuffled[currentIndex];
  const totalCards = shuffled.length;
  const progressPercent = totalCards > 0 ? ((reviewCount) / totalCards) * 100 : 0;

  const handleRate = useCallback((_rating: Rating) => {
    setReviewCount(prev => prev + 1);
    if (currentIndex < shuffled.length - 1) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setCardKey(prev => prev + 1);
      }, 150);
    } else {
      setTimeout(() => setFinished(true), 150);
    }
  }, [currentIndex, shuffled.length]);

  const handleRestart = () => {
    setCurrentIndex(0);
    setFinished(false);
    setCardKey(prev => prev + 1);
    setReviewCount(0);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setCurrentIndex(0);
      setFinished(false);
      setCardKey(0);
      setReviewCount(0);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[100vw] w-full h-[100dvh] max-h-[100dvh] flex flex-col p-0 gap-0 rounded-none border-none [&>button]:hidden">
        {/* Header — matches Study.tsx */}
        <header className="sticky top-0 z-20 bg-background flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 shrink-0">
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <p className="text-sm font-semibold truncate max-w-[140px] sm:max-w-[200px]">{deckName}</p>
            <Badge variant="outline" className="text-[10px] border-warning text-warning shrink-0">
              Modo Teste
            </Badge>
            {!finished && totalCards > 0 && (
              <span className="text-xs font-bold text-muted-foreground tabular-nums shrink-0">
                {currentIndex + 1}/{totalCards}
              </span>
            )}
          </div>
        </header>

        {/* Progress bar */}
        <div className="h-1.5 w-full bg-muted/40 shrink-0">
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`,
              borderRadius: '0 4px 4px 0',
            }}
          />
        </div>

        {/* Body */}
        <main className="flex flex-1 min-h-0 items-center justify-center px-2 sm:px-4 py-2 sm:py-4 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Carregando cards...</span>
            </div>
          ) : totalCards === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum card neste baralho.</p>
          ) : finished ? (
            <div className="animate-fade-in text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
              <h1 className="font-display text-3xl font-bold text-foreground">Sessão Concluída!</h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Você revisou <span className="font-bold text-primary">{totalCards}</span> {totalCards === 1 ? 'card' : 'cards'} no modo teste.
              </p>
              <p className="text-xs text-muted-foreground mt-1">Nenhum progresso foi salvo.</p>
              <div className="flex gap-2 justify-center mt-8">
                <Button variant="outline" className="gap-2" onClick={handleRestart}>
                  <RotateCcw className="h-4 w-4" /> Refazer
                </Button>
                <Button onClick={handleClose}>Voltar</Button>
              </div>
            </div>
          ) : current ? (
            <div key={cardKey} className="w-full animate-fade-in">
              <FlashCard
                frontContent={current.front_content}
                backContent={current.back_content}
                stability={current.stability ?? 0}
                difficulty={current.difficulty ?? 0}
                state={current.state ?? 0}
                scheduledDate={current.scheduled_date ?? new Date().toISOString()}
                lastReviewedAt={current.last_reviewed_at}
                cardType={current.card_type}
                onRate={handleRate}
                isSubmitting={false}
                algorithmMode="sm2"
              />
            </div>
          ) : null}
        </main>

        {/* Trial footer notice */}
        {!finished && totalCards > 0 && (
          <div className="shrink-0 pb-1">
            <p className="text-[10px] text-muted-foreground text-center">
              Modo teste — nenhum progresso será salvo
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TrialStudyModal;
