/**
 * QuestionStatsCard — compact study action bar with mastery indicator for questions.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PlayCircle, Sparkles } from 'lucide-react';

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

  const { data: hierarchyDeckIds = [effectiveDeckId] } = useQuery({
    queryKey: ['deck-hierarchy-ids', effectiveDeckId],
    queryFn: async () => {
      const allIds: string[] = [effectiveDeckId];
      let frontier = [effectiveDeckId];
      while (frontier.length > 0) {
        const { data: children } = await supabase
          .from('decks')
          .select('id')
          .in('parent_deck_id', frontier);
        if (!children || children.length === 0) break;
        const childIds = children.map((d: any) => d.id);
        allIds.push(...childIds);
        frontier = childIds;
      }
      return allIds;
    },
    enabled: !!effectiveDeckId,
    staleTime: 120_000,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['deck-questions-ids', effectiveDeckId, hierarchyDeckIds],
    queryFn: async () => {
      const { data } = await supabase
        .from('deck_questions' as any).select('id')
        .in('deck_id', hierarchyDeckIds);
      return (data ?? []) as unknown as { id: string }[];
    },
    enabled: !!effectiveDeckId && hierarchyDeckIds.length > 0,
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

  const masteryPct = useMemo(() => {
    const total = questions.length;
    if (total === 0) return 0;
    const latestByQ = new Map<string, { is_correct: boolean; answered_at: string }>();
    for (const a of attempts) {
      const prev = latestByQ.get(a.question_id);
      if (!prev || a.answered_at > prev.answered_at) latestByQ.set(a.question_id, a);
    }
    let correct = 0;
    for (const [, a] of latestByQ) {
      if (a.is_correct) correct++;
    }
    return Math.round((correct / total) * 100);
  }, [questions, attempts]);

  const total = questions.length;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex-1 flex gap-3">
          <Button
            onClick={onPractice}
            className="flex-1 h-12 text-base font-semibold gap-2"
            disabled={total === 0}
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
            </Button>
          )}
        </div>
        {total > 0 && (
          <div className="relative flex-shrink-0" title={`${masteryPct}% domínio`}>
            <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
              <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - masteryPct / 100)}`}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-foreground">{masteryPct}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionStatsCard;
