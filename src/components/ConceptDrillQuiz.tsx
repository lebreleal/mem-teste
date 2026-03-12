/**
 * ConceptDrillQuiz — inline quiz for deepening a weak concept.
 * Fetches related cards, generates questions, presents them inline.
 * Max 2 cascade levels per session.
 */
import { useState, useCallback } from 'react';
import { Zap, CheckCircle2, XCircle, Loader2, ChevronRight, BrainCircuit, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import * as globalConceptService from '@/services/globalConceptService';
import { toast } from 'sonner';

interface ConceptDrillQuizProps {
  conceptId: string;
  conceptName: string;
  conceptState: number;
  depth?: number; // current cascade level (1-based)
  maxDepth?: number;
  onComplete?: () => void;
}

interface GeneratedQuestion {
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string;
  concepts: string[];
}

type Phase = 'idle' | 'loading-cards' | 'generating' | 'quiz' | 'result' | 'done';

const STATE_LABELS: Record<number, string> = { 0: 'Novo', 1: 'Aprendendo', 2: 'Dominado', 3: 'Reaprendendo' };

const ConceptDrillQuiz = ({
  conceptId,
  conceptName,
  conceptState,
  depth = 1,
  maxDepth = 2,
  onComplete,
}: ConceptDrillQuizProps) => {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number; weakConcepts: string[] }>({
    correct: 0,
    wrong: 0,
    weakConcepts: [],
  });
  // Track new weak concepts for cascade
  const [cascadeConcepts, setCascadeConcepts] = useState<{ id: string; name: string; state: number }[]>([]);
  const [activeCascade, setActiveCascade] = useState<{ id: string; name: string; state: number } | null>(null);

  const startDrill = useCallback(async () => {
    if (!user) return;

    setPhase('loading-cards');
    try {
      const cards = await globalConceptService.getConceptRelatedCards(conceptId, user.id);

      if (cards.length === 0) {
        toast.error('Nenhum card encontrado para este tema.');
        setPhase('idle');
        return;
      }

      setPhase('generating');
      const cardIds = cards.map(c => c.id).slice(0, 50);
      const result = await globalConceptService.generateConceptQuestions(cardIds, 'flash', 1);

      if (!result || result.questions.length === 0) {
        toast.error('Não foi possível gerar questões. Tente novamente.');
        setPhase('idle');
        return;
      }

      setQuestions(result.questions);
      setCurrentIdx(0);
      setResults({ correct: 0, wrong: 0, weakConcepts: [] });
      setPhase('quiz');
    } catch (err) {
      console.error('Drill error:', err);
      toast.error('Erro ao iniciar aprofundamento.');
      setPhase('idle');
    }
  }, [conceptId, user]);

  const handleAnswer = useCallback(async (optionIdx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(optionIdx);
    setShowExplanation(true);

    const q = questions[currentIdx];
    const isCorrect = optionIdx === q.correct_index;

    setResults(prev => ({
      ...prev,
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1),
      weakConcepts: isCorrect
        ? prev.weakConcepts
        : [...new Set([...prev.weakConcepts, ...q.concepts])],
    }));

    // Record attempt
    if (user && q) {
      // We don't have a question_id saved — this is an inline drill
      // Update concept mastery directly
      try {
        await globalConceptService.updateConceptMastery(conceptId, isCorrect);
      } catch {}
    }
  }, [selectedOption, questions, currentIdx, conceptId, user]);

  const handleNext = useCallback(async () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      // Quiz done — find weak concepts for potential cascade
      setPhase('result');

      if (results.weakConcepts.length > 0 && depth < maxDepth && user) {
        // Find the weakest concept from wrong answers
        const allConcepts = results.weakConcepts;
        const { data: concepts } = await supabase
          .from('global_concepts' as any)
          .select('id, name, state, stability')
          .eq('user_id', user.id)
          .in('slug', allConcepts.map(c => globalConceptService.conceptSlug(c)));

        if (concepts && (concepts as any[]).length > 0) {
          // Sort by stability (weakest first)
          const sorted = (concepts as any[]).sort((a: any, b: any) => a.stability - b.stability);
          setCascadeConcepts(sorted.slice(0, 3).map((c: any) => ({ id: c.id, name: c.name, state: c.state })));
        }
      }
    }
  }, [currentIdx, questions.length, results.weakConcepts, depth, maxDepth, user]);

  const handleStop = useCallback(() => {
    setPhase('done');
    onComplete?.();
  }, [onComplete]);

  // ─── Idle: show Aprofundar button ───
  if (phase === 'idle') {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
        onClick={startDrill}
      >
        <Zap className="h-3 w-3" />
        Aprofundar tema
      </Button>
    );
  }

  // ─── Loading ───
  if (phase === 'loading-cards' || phase === 'generating') {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-4 space-y-2 animate-pulse">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {phase === 'loading-cards'
            ? `Buscando cards sobre "${conceptName}"...`
            : `Gerando questões sobre "${conceptName}"...`}
        </div>
        {depth > 1 && (
          <Badge variant="outline" className="text-[10px]">Nível {depth}</Badge>
        )}
      </div>
    );
  }

  // ─── Done ───
  if (phase === 'done') {
    return null;
  }

  // ─── Result ───
  if (phase === 'result') {
    const total = results.correct + results.wrong;
    const pct = total > 0 ? Math.round((results.correct / total) * 100) : 0;

    return (
      <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <BrainCircuit className="h-4 w-4 text-primary" />
            Resultado: {conceptName}
          </h4>
          {depth > 1 && <Badge variant="outline" className="text-[10px]">Nível {depth}</Badge>}
        </div>

        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> {results.correct} acertos
          </span>
          <span className="flex items-center gap-1 text-destructive">
            <XCircle className="h-3.5 w-3.5" /> {results.wrong} erros
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>

        {cascadeConcepts.length > 0 && depth < maxDepth && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tema mais fraco identificado:
            </p>
            {/* Show only the weakest concept */}
            {!activeCascade && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={() => setActiveCascade(cascadeConcepts[0])}
              >
                <Zap className="h-3 w-3" />
                Aprofundar: {cascadeConcepts[0].name}
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
            {activeCascade && (
              <ConceptDrillQuiz
                conceptId={activeCascade.id}
                conceptName={activeCascade.name}
                conceptState={activeCascade.state}
                depth={depth + 1}
                maxDepth={maxDepth}
                onComplete={() => setActiveCascade(null)}
              />
            )}
          </div>
        )}

        {depth >= maxDepth && results.wrong > 0 && (
          <p className="text-xs text-muted-foreground italic">
            Você tem temas para revisar. O sistema agendará revisões automáticas via repetição espaçada.
          </p>
        )}

        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleStop}>
          <StopCircle className="h-3 w-3" /> Concluir
        </Button>
      </div>
    );
  }

  // ─── Quiz ───
  const q = questions[currentIdx];
  const plainText = q.question_text.replace(/<[^>]+>/g, '');

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {currentIdx + 1}/{questions.length}
          </Badge>
          {depth > 1 && (
            <Badge variant="secondary" className="text-[10px]">Nível {depth}</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 gap-1" onClick={handleStop}>
          <StopCircle className="h-3 w-3" /> Parar
        </Button>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{plainText}</p>

      <div className="space-y-2">
        {q.options.map((opt, idx) => {
          let optionClass = 'border-border/50 hover:bg-accent/50';
          if (selectedOption !== null) {
            if (idx === q.correct_index) {
              optionClass = 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
            } else if (idx === selectedOption && idx !== q.correct_index) {
              optionClass = 'border-destructive bg-destructive/10 text-destructive';
            } else {
              optionClass = 'border-border/30 opacity-50';
            }
          }

          return (
            <button
              key={idx}
              className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${optionClass}`}
              onClick={() => handleAnswer(idx)}
              disabled={selectedOption !== null}
            >
              <span className="font-medium mr-1.5">{String.fromCharCode(65 + idx)}.</span>
              {opt}
            </button>
          );
        })}
      </div>

      {showExplanation && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Explicação:</p>
          <p>{q.explanation}</p>
        </div>
      )}

      {selectedOption !== null && (
        <Button size="sm" className="w-full gap-1" onClick={handleNext}>
          {currentIdx < questions.length - 1 ? 'Próxima' : 'Ver resultado'}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default ConceptDrillQuiz;
