import { useState } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { getOrGenerateQuestion, markConceptMastered, markConceptWeak } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { X as XIcon, BrainCircuit, Stethoscope, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

interface DiagnosticModeProps {
  queue: GlobalConcept[];
  onClose: () => void;
}

const DiagnosticMode = ({ queue, onClose }: DiagnosticModeProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState({ correct: 0, wrong: 0 });

  async function loadQuestion(concept: GlobalConcept) {
    setLoading(true);
    setGenerating(false);
    try {
      const result = await getOrGenerateQuestion(concept.id, user!.id, concept.name, concept.category);
      if (result.wasGenerated) setGenerating(true);
      setQuestion(result.question);
    } catch {
      setQuestion(null);
    }
    setLoading(false);
  }

  // Load first question on mount
  useState(() => {
    if (queue.length > 0 && user) {
      loadQuestion(queue[0]);
    }
  });

  const concept = queue[index];
  const isCorrect = question?.correctIndices?.includes(selected) ?? false;
  const progress = queue.length > 0 ? ((index + 1) / queue.length) * 100 : 0;

  const handleAnswer = () => {
    if (selected === null || !question) return;
    setConfirmed(true);
  };

  const handleNext = async (wasCorrect: boolean) => {
    if (!concept || !user) return;

    if (wasCorrect) {
      await markConceptMastered(concept.id);
      setResults(r => ({ ...r, correct: r.correct + 1 }));
    } else {
      await markConceptWeak(concept.id);
      setResults(r => ({ ...r, wrong: r.wrong + 1 }));
    }

    const nextIdx = index + 1;
    if (nextIdx >= queue.length) {
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      queryClient.invalidateQueries({ queryKey: ['ready-to-learn'] });
      toast.success(`Diagnóstico concluído: ${results.correct + (wasCorrect ? 1 : 0)} acertos, ${results.wrong + (wasCorrect ? 0 : 1)} erros`);
      onClose();
      return;
    }

    setIndex(nextIdx);
    setSelected(null);
    setConfirmed(false);
    setGenerating(false);
    loadQuestion(queue[nextIdx]);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-card/95 backdrop-blur-md px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <XIcon className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Diagnóstico {index + 1}/{queue.length}</p>
          <p className="text-sm font-semibold text-foreground truncate">{concept?.name}</p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          <Stethoscope className="h-3 w-3 mr-1" /> Knowledge Check
        </Badge>
      </header>

      <div className="px-4 py-2">
        <Progress value={progress} className="h-1.5" />
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {loading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="h-4 w-4 animate-spin" />
              <span>Preparando questão para "{concept?.name}"...</span>
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : !question ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BrainCircuit className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar questão para este conceito.</p>
              <Button variant="outline" className="mt-4" onClick={() => handleNext(false)}>Pular (marcar como fraco)</Button>
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
                const isSelected = selected === i;
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
                    onClick={() => setSelected(i)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm transition-all ${optClasses}`}
                  >
                    <span className="font-medium text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {!confirmed ? (
              <Button className="w-full" disabled={selected === null} onClick={handleAnswer}>Confirmar</Button>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-xl border px-4 py-3 text-sm ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                  {isCorrect ? '✅ Correto — conceito dominado!' : '❌ Incorreto — conceito marcado para revisão'}
                </div>
                <Button className="w-full" onClick={() => handleNext(isCorrect)}>
                  {index + 1 >= queue.length ? 'Finalizar Diagnóstico' : 'Próximo Conceito'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DiagnosticMode;
