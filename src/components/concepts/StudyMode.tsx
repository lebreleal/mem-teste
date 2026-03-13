import { useState, useCallback } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { getVariedQuestion } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { X as XIcon, BrainCircuit } from 'lucide-react';
import type { Rating } from '@/lib/fsrs';

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

  // Load first question on mount
  useState(() => {
    if (queue.length > 0 && user) {
      getVariedQuestion(queue[0].id, user.id)
        .then(q => setQuestion(q))
        .catch(() => setQuestion(null))
        .finally(() => setLoading(false));
    }
  });

  const concept = queue[index];
  const isCorrect = question?.correctIndices?.includes(selectedOption) ?? false;

  const handleAnswer = () => {
    if (selectedOption === null || !question) return;
    setConfirmed(true);
  };

  const handleRate = useCallback(async (rating: Rating) => {
    if (!concept || !user) return;
    const correct = question?.correctIndices?.includes(selectedOption) ?? false;
    await onRate(concept, rating, correct);

    const nextIdx = index + 1;
    if (nextIdx >= queue.length) {
      onClose();
      return;
    }

    setIndex(nextIdx);
    setSelectedOption(null);
    setConfirmed(false);
    setLoading(true);
    try {
      const q = await getVariedQuestion(queue[nextIdx].id, user.id);
      setQuestion(q);
    } catch { setQuestion(null); }
    setLoading(false);
  }, [queue, index, question, selectedOption, onRate, user, concept, onClose]);

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
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : !question ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BrainCircuit className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma questão vinculada a este conceito.</p>
              <Button variant="outline" className="mt-4" onClick={() => handleRate(3)}>Pular</Button>
            </CardContent>
          </Card>
        ) : (
          <>
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
                  {isCorrect ? '✅ Correto!' : '❌ Incorreto'}
                  {question.explanation && (
                    <p className="mt-2 text-xs text-muted-foreground">{question.explanation}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" className="text-xs border-destructive/30 text-destructive" onClick={() => handleRate(1)}>Errei</Button>
                  <Button variant="outline" className="text-xs" onClick={() => handleRate(3)}>Bom</Button>
                  <Button variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400" onClick={() => handleRate(4)}>Fácil</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StudyMode;
