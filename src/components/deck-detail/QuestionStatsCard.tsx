/**
 * QuestionStatsCard — compact study action bar with mastery indicator for questions.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchDeckHierarchyIds, fetchDeckQuestionStats } from '@/services/uiQueryService';
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
    queryFn: () => fetchDeckHierarchyIds(effectiveDeckId),
    enabled: !!effectiveDeckId,
    staleTime: 120_000,
  });

  const { data: qStats } = useQuery({
    queryKey: ['deck-questions-stats', effectiveDeckId, hierarchyDeckIds],
    queryFn: () => fetchDeckQuestionStats(hierarchyDeckIds, user!.id),
    enabled: !!effectiveDeckId && hierarchyDeckIds.length > 0 && !!user,
    staleTime: 30_000,
  });

  const questions = qStats ? Array.from({ length: qStats.total }, (_, i) => ({ id: String(i) })) : [];
  const attempts = qStats ? Array.from({ length: qStats.correct + qStats.wrong }, (_, i) => ({
    question_id: String(i),
    is_correct: i < qStats.correct,
    answered_at: new Date().toISOString(),
  })) : [];

  const masteryPct = useMemo(() => {
    if (!qStats || qStats.total === 0) return 0;
    return Math.round((qStats.correct / qStats.total) * 100);
  }, [qStats]);

  const total = qStats?.total ?? 0;

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
