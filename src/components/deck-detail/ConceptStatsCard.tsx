/**
 * ConceptStatsCard — hero card for the Concepts tab, matching DeckStatsCard layout.
 */
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { BookOpen, Plus, BrainCircuit, Lightbulb, CheckCircle2 } from 'lucide-react';
import type { ConceptRow } from '@/services/conceptService';

interface ConceptStatsCardProps {
  concepts: ConceptRow[];
  onStudyWeak: () => void;
  onCreate: () => void;
}

const ConceptStatsCard = ({ concepts, onStudyWeak, onCreate }: ConceptStatsCardProps) => {
  const stats = useMemo(() => {
    let newCount = 0, learning = 0, mastered = 0;
    const now = new Date();
    for (const c of concepts) {
      if (c.state === 0) newCount++;
      else if (c.state === 1 || c.state === 3) learning++;
      else if (c.state === 2) mastered++;
    }
    // Concepts due for review
    const dueCount = concepts.filter(c => new Date(c.scheduled_date) <= now || c.state === 0).length;
    return { total: concepts.length, newCount, learning, mastered, dueCount };
  }, [concepts]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-center mb-4">
        <div className="text-center">
          <span className="font-display text-4xl sm:text-5xl font-bold text-foreground">
            {stats.total}
          </span>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            conceitos no baralho
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 sm:gap-8 mb-4 sm:mb-6">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{stats.newCount}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Novos</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <Network className="h-4 w-4 text-orange-500" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{stats.learning}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Aprendendo</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{stats.mastered}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Dominados</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 gap-2" onClick={onStudyWeak} disabled={stats.dueCount === 0}>
          <BookOpen className="h-4 w-4" />
          Estudar ({stats.dueCount})
        </Button>
        <Button variant="outline" size="icon" onClick={onCreate} title="Criar conceito">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ConceptStatsCard;
