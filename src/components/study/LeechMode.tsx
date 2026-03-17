/**
 * LeechMode — Full-screen leech reinforcement session.
 * Extracted from Study.tsx (copy-paste integral).
 */

import { Brain, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeechModeState } from '@/hooks/useLeechDetection';
import { LEECH_THRESHOLD } from '@/hooks/useLeechDetection';

interface LeechModeProps {
  leechMode: LeechModeState;
  setLeechMode: React.Dispatch<React.SetStateAction<LeechModeState | null>>;
  exitLeechMode: () => void;
  leechAdvanceLockRef: React.MutableRefObject<boolean>;
}

const LeechMode = ({ leechMode, setLeechMode, exitLeechMode, leechAdvanceLockRef }: LeechModeProps) => {
  const {
    concept,
    reinforceCards,
    currentIndex,
    round,
    flipped,
    leechCard,
    loading,
    feedback,
    isAdvancing = false,
    correctCount = 0,
    wrongCount = 0,
    retryCards,
  } = leechMode;

  const hasCards = reinforceCards.length > 0;
  const currentReinforceCard = hasCards ? reinforceCards[currentIndex] : null;
  const totalCards = reinforceCards.length;
  const isRetryRound = round > 1;

  const advanceCard = (wasCorrect: boolean) => {
    if (!currentReinforceCard || isAdvancing || leechAdvanceLockRef.current) return;

    leechAdvanceLockRef.current = true;
    const isLastCardInRound = currentIndex >= totalCards - 1;
    const shouldExitAfterThisAnswer = wasCorrect && isLastCardInRound && retryCards.length === 0;

    setLeechMode(prev => prev ? {
      ...prev,
      isAdvancing: true,
      feedback: wasCorrect ? 'correct' : null,
      correctCount: (prev.correctCount ?? 0) + (wasCorrect ? 1 : 0),
      wrongCount: (prev.wrongCount ?? 0) + (wasCorrect ? 0 : 1),
    } : null);

    const delayMs = wasCorrect ? 650 : 120;

    setTimeout(() => {
      if (shouldExitAfterThisAnswer) {
        exitLeechMode();
        return;
      }

      setLeechMode(prev => {
        if (!prev) return null;

        const activeCard = prev.reinforceCards[prev.currentIndex];
        const nextRetryCards = !wasCorrect && activeCard
          ? (prev.retryCards.some(card => card.id === activeCard.id)
            ? prev.retryCards
            : [...prev.retryCards, activeCard])
          : prev.retryCards;
        const atEndOfRound = prev.currentIndex >= prev.reinforceCards.length - 1;

        if (!atEndOfRound) {
          return {
            ...prev,
            retryCards: nextRetryCards,
            currentIndex: prev.currentIndex + 1,
            flipped: false,
            feedback: null,
            isAdvancing: false,
          };
        }

        return {
          ...prev,
          reinforceCards: nextRetryCards,
          retryCards: [],
          currentIndex: 0,
          round: (prev.round ?? 1) + 1,
          flipped: false,
          feedback: null,
          isAdvancing: false,
        };
      });

      leechAdvanceLockRef.current = false;
    }, delayMs);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary">Reforço de Base</p>
            {concept && <p className="text-[10px] text-muted-foreground">{concept.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasCards && totalCards > 0 && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-primary font-bold">{correctCount}✓</span>
              <span className="text-destructive font-bold">{wrongCount}✗</span>
            </div>
          )}
          {hasCards && (
            <span className="text-xs font-bold text-muted-foreground tabular-nums">
              {currentIndex + 1}/{totalCards}
            </span>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {hasCards && totalCards > 0 && (
        <div className="h-1 w-full bg-muted/40">
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${((currentIndex + (isAdvancing ? 1 : 0)) / totalCards) * 100}%`,
              background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`,
              borderRadius: '0 4px 4px 0',
            }}
          />
        </div>
      )}

      <main className="flex flex-1 min-h-0 flex-col items-center justify-center px-4 py-6 overflow-y-auto">
        {loading ? (
          <div className="animate-fade-in w-full max-w-lg space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Brain className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Gerando conteúdo de reforço simplificado...</p>
            <p className="text-[10px] text-muted-foreground">Vamos explicar de um jeito mais fácil</p>
          </div>
        ) : (
          <div className="animate-fade-in w-full max-w-lg space-y-5 text-center">
            {/* Intro message — only on first card before flip */}
            {currentIndex === 0 && !flipped && !feedback && !isRetryRound && (
              <div className="space-y-1.5 px-2">
                <p className="text-sm text-muted-foreground">
                  Você errou este card <span className="font-bold text-destructive">{LEECH_THRESHOLD}×</span>.
                  {hasCards
                    ? <> Vamos revisar o tema com cards mais simples para reforçar a base.</>
                    : <> Revise o conteúdo abaixo antes de continuar.</>
                  }
                </p>
              </div>
            )}

            {isRetryRound && !feedback && (
              <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                Revisando novamente os cards marcados como "Não lembrei".
              </div>
            )}

            {/* Feedback overlay (somente para acerto) */}
            {feedback === 'correct' && (
              <div className="rounded-xl py-3 px-4 text-sm font-medium transition-all animate-fade-in bg-primary/10 text-primary">
                ✓ Boa! Você lembrou.
              </div>
            )}

            {/* Reinforcement card */}
            {hasCards && currentReinforceCard && !feedback ? (
              <div
                className={`cursor-pointer rounded-2xl border-2 bg-card p-6 shadow-sm transition-all hover:shadow-md min-h-[200px] flex items-center justify-center ${
                  flipped ? 'border-primary/30' : 'border-border'
                }`}
                onClick={() => !flipped && !isAdvancing && setLeechMode(prev => prev ? { ...prev, flipped: true } : null)}
              >
                <div className="w-full">
                  {!flipped ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pergunta</p>
                      <div
                        className="text-base text-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: currentReinforceCard.front_content }}
                      />
                      <p className="text-[10px] text-muted-foreground mt-4 opacity-60">Tente lembrar, depois toque para ver</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px] font-medium text-primary uppercase tracking-wider">Resposta</p>
                      <div
                        className="text-base text-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: currentReinforceCard.back_content }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : !feedback && (
              /* Fallback: show the leech card's back content as study material */
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <p className="text-[10px] font-medium text-primary uppercase tracking-wider mb-3">Revise o conteúdo</p>
                <div
                  className="text-base text-foreground leading-relaxed text-left"
                  dangerouslySetInnerHTML={{ __html: leechCard.back_content }}
                />
              </div>
            )}

            {/* Action buttons — only show after flipping */}
            {!feedback && (
              <div className="flex gap-3 justify-center pt-2">
                {hasCards && flipped ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => advanceCard(false)}
                      disabled={isAdvancing}
                      className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      Não lembrei
                    </Button>
                    <Button
                      onClick={() => advanceCard(true)}
                      disabled={isAdvancing}
                      className="gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Lembrei
                    </Button>
                  </>
                ) : !hasCards ? (
                  <Button onClick={exitLeechMode} className="gap-2">
                    Entendi, voltar à sessão <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default LeechMode;
