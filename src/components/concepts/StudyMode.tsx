import { useState, useCallback, useEffect } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { getOrGenerateQuestion } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { X as XIcon, BrainCircuit, Wand2 } from 'lucide-react';
import type { Rating } from '@/lib/fsrs';

const MASTERY_THRESHOLD = 2; // consecutive correct answers needed

interface StudyModeProps {
  queue: GlobalConcept[];
  onClose: () => void;
  onRate: (concept: GlobalConcept, rating: Rating, isCorrect: boolean) => Promise<void>;
}

const StudyMode = ({ queue, onClose, onRate }: StudyModeProps) => {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);

  async function loadQuestion(concept: GlobalConcept) {
    setLoading(true);
    setGenerating(false);
    try {
      const result = await getOrGenerateQuestion(concept.id, user!.id, concept.name, concept.category);
      if (result.wasGenerated && !result.question) {
        setQuestion(null);
      } else {
        if (result.wasGenerated) setGenerating(true);
        setQuestion(result.question);
      }
    } catch {
      setQuestion(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (queue.length > 0 && user) {
      loadQuestion(queue[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const concept = queue[index];
  const isCorrect = question?.correctIndices?.includes(selectedOption) ?? false;

  const handleAnswer = () => {
    if (selectedOption === null || !question) return;
    setConfirmed(true);
  };

  const advanceConcept = useCallback(async (correct: boolean) => {
    if (!concept || !user) return;

    if (correct) {
      const newStreak = consecutiveCorrect + 1;
      if (newStreak >= MASTERY_THRESHOLD) {
        // Mastered — submit good rating and move to next concept
        await onRate(concept, 3, true);
        moveToNextConcept();
        return;
      }
      // Need more correct answers — load another question for same concept
      setConsecutiveCorrect(newStreak);
      setSelectedOption(null);
      setConfirmed(false);
      setGenerating(false);
      loadQuestion(concept);
    } else {
      // Failed — submit again rating and move on
      await onRate(concept, 1, false);
      moveToNextConcept();
    }
  }, [concept, user, consecutiveCorrect, onRate, queue, index]);

  function moveToNextConcept() {
    const nextIdx = index + 1;
    if (nextIdx >= queue.length) {
      onClose();
      return;
    }
    setIndex(nextIdx);
    setSelectedOption(null);
    setConfirmed(false);
    setGenerating(false);
    setConsecutiveCorrect(0);
    loadQuestion(queue[nextIdx]);
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-card/95 backdrop-blur-md px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <XIcon className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Conceito {index + 1}/{queue.length}</p>
          <p className="text-sm font-semibold text-foreground truncate">{concept?.name}</p>
          {concept?.category && (
            <p className="text-[10px] text-muted-foreground">{concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}</p>
          )}
        </div>
        <Progress value={((index + 1) / queue.length) * 100} className="w-20 h-1.5" />
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
        {consecutiveCorrect > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            Acertos consecutivos: {consecutiveCorrect}/{MASTERY_THRESHOLD}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="h-4 w-4 animate-spin" />
              <span>Buscando questão...</span>
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : !question ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BrainCircuit className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar questões para este conceito.</p>
              <Button variant="outline" className="mt-4" onClick={() => advanceConcept(false)}>Pular</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {generating && (
              <div className="flex items-center gap-1.5 text-[10px] text-primary">
                <Wand2 className="h-3 w-3" />
                <span>Questão gerada automaticamente por IA</span>
              </div>
            )}
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{question.questionText}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {(question.options ?? []).map((opt: string, i: number) => {
                const isSelected = selectedOption === i;
                const isCorrectOpt = question.correctIndices?.includes(i);
                let optClasses = 'border-border/50 bg-card hover:bg-accent/30';
                if (confirmed) {
                  if (isCorrectOpt) optClasses = 'border-emerald-500 bg-emerald-500/10';
                  else if (isSelected && !isCorrectOpt) optClasses = 'border-destructive bg-destructive/10';
                } else if (isSelected) {
                  optClasses = 'border-primary bg-primary/5';
                }

                return (
                  <button
                    key={i}
                    disabled={confirmed}
                    onClick={() => setSelectedOption(i)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm transition-all ${optClasses}`}
                  >
                    <span className="font-medium text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {!confirmed ? (
              <Button className="w-full" disabled={selectedOption === null} onClick={handleAnswer}>Confirmar</Button>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-xl border px-4 py-3 text-sm ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                  {isCorrect
                    ? consecutiveCorrect + 1 >= MASTERY_THRESHOLD
                      ? '✅ Conceito dominado!'
                      : `✅ Correto! Mais ${MASTERY_THRESHOLD - consecutiveCorrect - 1} para confirmar domínio.`
                    : '❌ Incorreto — conceito marcado para revisão futura'}
                  {question.explanation && (
                    <p className="mt-2 text-xs text-muted-foreground">{question.explanation}</p>
                  )}
                </div>
                <Button className="w-full" onClick={() => advanceConcept(isCorrect)}>
                  {isCorrect && consecutiveCorrect + 1 < MASTERY_THRESHOLD
                    ? 'Próxima questão'
                    : index + 1 >= queue.length
                      ? 'Finalizar'
                      : 'Próximo conceito'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StudyMode;
