/**
 * DeckStatsCard – displays study stats and action buttons for the deck.
 */

import { useDeckDetail } from './DeckDetailContext';
import { Button } from '@/components/ui/button';
import { BookOpen, SquarePlus, RotateCcw, Layers, Brain, ThumbsDown, ThumbsUp } from 'lucide-react';

const DeckStatsCard = () => {
  const {
    totalDue, newCountToday, learningCount, masteredToday, studyPending,
    isQuickReview, totalCards, deckId, navigate,
    setExamModalOpen,
  } = useDeckDetail();

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-center mb-4">
        <div className="text-center">
          <span className="font-display text-4xl sm:text-5xl font-bold text-foreground">
            {isQuickReview ? totalCards : totalDue}
          </span>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isQuickReview ? 'cartões no baralho' : 'cartões para hoje'}
          </p>
        </div>
      </div>

      {isQuickReview ? (
        /* Quick Review mode: Não estudado / Não entendi / Entendi */
        <div className="flex items-center justify-center gap-6 sm:gap-8 mb-4 sm:mb-6">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <SquarePlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg sm:text-2xl font-bold text-foreground">{newCountToday}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Não estudado</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <ThumbsDown className="h-4 w-4 text-orange-500" />
              <span className="text-lg sm:text-2xl font-bold text-foreground">{learningCount}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Não entendi</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <ThumbsUp className="h-4 w-4 text-primary" />
              <span className="text-lg sm:text-2xl font-bold text-foreground">{masteredToday}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Entendi</span>
          </div>
        </div>
      ) : (
        /* SRS modes: Novos / Em andamento / Dominados */
        <div className="flex items-center justify-center gap-6 sm:gap-8 mb-4 sm:mb-6">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <SquarePlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg sm:text-2xl font-bold text-foreground">{newCountToday}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Novos</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4 text-green-500" />
              <span className="text-lg sm:text-2xl font-bold text-foreground">{learningCount}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Aprendendo</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-lg sm:text-2xl font-bold text-foreground">{masteredToday}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Dominados</span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={() => navigate(`/study/${deckId}`, { replace: true })}
          className="flex-1 h-12 text-base font-semibold gap-2"
          disabled={isQuickReview ? totalCards === 0 : studyPending === 0}
        >
          <BookOpen className="h-5 w-5" />
          Estudar
        </Button>
        <Button
          variant="outline"
          onClick={() => setExamModalOpen(true)}
          className="h-12 gap-2 px-4"
          disabled={totalCards === 0}
          title="Criar Prova com IA"
        >
          <Brain className="h-5 w-5" />
          <span className="hidden sm:inline">Prova</span>
        </Button>
      </div>
    </div>
  );
};

export default DeckStatsCard;
