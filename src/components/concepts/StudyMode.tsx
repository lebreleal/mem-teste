import { useState, useCallback, useEffect } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { getOrGenerateQuestion } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { X as XIcon, BrainCircuit, Wand2, ThumbsUp, ThumbsDown } from 'lucide-react';
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

  // Elaborative Interrogation state
  const [elaboration, setElaboration] = useState('');
  const [showElaboration, setShowElaboration] = useState(false); // true after error, before showing explanation
  const [elaborationSubmitted, setElaborationSubmitted] = useState(false);

  // Confidence check state
  const [awaitingConfidence, setAwaitingConfidence] = useState(false);

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

    if (isCorrect) {
      // Show confidence check
      setAwaitingConfidence(true);
    } else {
      // Show elaborative interrogation prompt
      setShowElaboration(true);
      setElaboration('');
      setElaborationSubmitted(false);
    }
  };

  // Track guess count per concept to avoid infinite loop
  const [guessCount, setGuessCount] = useState(0);

  // Confidence response handler
  const handleConfidence = useCallback(async (wasConfident: boolean) => {
    setAwaitingConfidence(false);

    if (wasConfident) {
      const newStreak = consecutiveCorrect + 1;
      if (newStreak >= MASTERY_THRESHOLD) {
        await onRate(concept, 3, true);
        moveToNextConcept();
        return;
      }
      setConsecutiveCorrect(newStreak);
      resetForNextQuestion(concept);
    } else {
      const newGuessCount = guessCount + 1;
      setGuessCount(newGuessCount);

      if (newGuessCount >= 2) {
        // After 2 guesses, treat as Hard (rating=2) — still counts as correct but with penalty
        await onRate(concept, 2, true);
        moveToNextConcept();
        return;
      }
      // First guess — don't increment streak, load another question
      resetForNextQuestion(concept);
    }
  }, [concept, consecutiveCorrect, onRate, queue, index, guessCount]);

  // Elaboration submit — reveal explanation
  const handleElaborationSubmit = () => {
    setElaborationSubmitted(true);
  };

  // After error + elaboration, advance
  const handleAdvanceAfterError = useCallback(async () => {
    if (!concept || !user) return;
    await onRate(concept, 1, false);
    moveToNextConcept();
  }, [concept, user, onRate, queue, index]);

  function resetForNextQuestion(c: GlobalConcept) {
    setSelectedOption(null);
    setConfirmed(false);
    setGenerating(false);
    setShowElaboration(false);
    setElaboration('');
    setElaborationSubmitted(false);
    setAwaitingConfidence(false);
    loadQuestion(c);
  }

  function moveToNextConcept() {
    const nextIdx = index + 1;
    if (nextIdx >= queue.length) {
      onClose();
      return;
    }
    setIndex(nextIdx);
    setConsecutiveCorrect(0);
    resetForNextQuestion(queue[nextIdx]);
  }

  // Correct answer option index for elaboration prompt
  const correctOptionIndex = question?.correctIndices?.[0] ?? 0;
  const correctOptionLetter = String.fromCharCode(65 + correctOptionIndex);

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
              <Button variant="outline" className="mt-4" onClick={handleAdvanceAfterError}>Pular</Button>
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

            {/* Pre-confirmation */}
            {!confirmed && (
              <Button className="w-full" disabled={selectedOption === null} onClick={handleAnswer}>Confirmar</Button>
            )}

            {/* Post-confirmation: CORRECT → Confidence check */}
            {confirmed && isCorrect && awaitingConfidence && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  ✅ Correto!
                </div>
                <p className="text-xs text-muted-foreground text-center">Você tinha certeza da resposta?</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" onClick={() => handleConfidence(false)}>
                    <ThumbsDown className="h-3.5 w-3.5" />
                    Chutei
                  </Button>
                  <Button className="flex-1 gap-1.5" onClick={() => handleConfidence(true)}>
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Tinha certeza
                  </Button>
                </div>
              </div>
            )}

            {/* Post-confirmation: CORRECT → after confidence resolved */}
            {confirmed && isCorrect && !awaitingConfidence && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  {consecutiveCorrect >= MASTERY_THRESHOLD
                    ? '✅ Conceito dominado!'
                    : `✅ Correto! Mais ${MASTERY_THRESHOLD - consecutiveCorrect} para confirmar domínio.`}
                </div>
              </div>
            )}

            {/* Post-confirmation: INCORRECT → Elaborative Interrogation */}
            {confirmed && !isCorrect && showElaboration && !elaborationSubmitted && (
              <div className="space-y-3">
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  ❌ Incorreto
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Antes de ver a explicação: por que a alternativa <strong>{correctOptionLetter}</strong> está correta?
                  </p>
                  <Textarea
                    value={elaboration}
                    onChange={e => setElaboration(e.target.value)}
                    placeholder="Tente explicar com suas palavras..."
                    className="min-h-[60px] text-sm"
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={handleElaborationSubmit}>
                      Pular
                    </Button>
                    <Button size="sm" className="flex-1" disabled={elaboration.trim().length < 5} onClick={handleElaborationSubmit}>
                      Ver explicação
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Post-elaboration: show explanation and advance */}
            {confirmed && !isCorrect && elaborationSubmitted && (
              <div className="space-y-3">
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  ❌ Incorreto — conceito marcado para revisão futura
                </div>
                {question.explanation && (
                  <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">Explicação:</p>
                    {question.explanation}
                  </div>
                )}
                {elaboration.trim().length >= 5 && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground mb-1">Sua elaboração:</p>
                    {elaboration}
                  </div>
                )}
                <Button className="w-full" onClick={handleAdvanceAfterError}>
                  {index + 1 >= queue.length ? 'Finalizar' : 'Próximo conceito'}
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
