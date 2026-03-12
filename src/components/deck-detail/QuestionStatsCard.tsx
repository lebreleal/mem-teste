/**
 * QuestionStatsCard — hero card for the Questions tab, matching DeckStatsCard layout.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PlayCircle, Sparkles, HelpCircle, CheckCircle2, XCircle } from 'lucide-react';

interface QuestionStatsCardProps {
  deckId: string;
  sourceDeckId?: string | null;
  isReadOnly?: boolean;
  onPractice: () => void;
  onCreateAI: () => void;
}

const QuestionStatsCard = ({ deckId, sourceDeckId, isReadOnly, onPractice, onCreateAI }: QuestionStatsCardProps) => {
  const { user } = useAuth();
  const effectiveDeckId = sourceDeckId || deckId;

  const { data: questions = [] } = useQuery({
    queryKey: ['deck-questions-ids', effectiveDeckId],
    queryFn: async () => {
      const { data } = await supabase
        .from('deck_questions' as any).select('id')
        .eq('deck_id', effectiveDeckId);
      return (data ?? []) as unknown as { id: string }[];
    },
    enabled: !!effectiveDeckId,
    staleTime: 30_000,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ['question-attempts', effectiveDeckId],
    queryFn: async () => {
      if (!user) return [];
      const questionIds = questions.map(q => q.id);
      if (questionIds.length === 0) return [];
      const { data } = await supabase
        .from('deck_question_attempts' as any).select('question_id, is_correct, answered_at')
        .eq('user_id', user.id)
        .in('question_id', questionIds);
      return (data ?? []) as unknown as { question_id: string; is_correct: boolean; answered_at: string }[];
    },
    enabled: !!user && questions.length > 0,
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    const total = questions.length;
    const latestByQ = new Map<string, { is_correct: boolean; answered_at: string }>();
    for (const a of attempts) {
      const prev = latestByQ.get(a.question_id);
      if (!prev || a.answered_at > prev.answered_at) latestByQ.set(a.question_id, a);
    }
    let correct = 0, wrong = 0;
    for (const [, a] of latestByQ) {
      if (a.is_correct) correct++; else wrong++;
    }
    const unanswered = total - latestByQ.size;
    return { total, correct, wrong, unanswered };
  }, [questions, attempts]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-sm">
      {/* Big number */}
      <div className="flex items-center justify-center mb-4">
        <div className="text-center">
          <span className="font-display text-4xl sm:text-5xl font-bold text-foreground">
            {stats.total}
          </span>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            questões no banco
          </p>
        </div>
      </div>

      {/* 3-column stats */}
      <div className="flex items-center justify-center gap-6 sm:gap-8 mb-4 sm:mb-6">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{stats.unanswered}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">A responder</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" style={{ color: 'hsl(142 71% 45%)' }} />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{stats.correct}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Corretas</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{stats.wrong}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Erradas</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onPractice}
          className="flex-1 h-12 text-base font-semibold gap-2"
          disabled={stats.total === 0}
        >
          <PlayCircle className="h-5 w-5" />
          Estudar
        </Button>
        {!isReadOnly && (
          <Button
            variant="outline"
            onClick={onCreateAI}
            className="h-12 gap-2 px-4"
            title="Gerar questões com IA"
          >
            <Sparkles className="h-5 w-5" />
            <span className="hidden sm:inline">Gerar</span>
          </Button>
        )}
      </div>
    </div>
  );
};

export default QuestionStatsCard;
