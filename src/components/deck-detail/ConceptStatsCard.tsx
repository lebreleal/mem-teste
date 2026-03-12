/**
 * ConceptStatsCard — mastery dashboard hero card for the Concepts tab.
 * Data sourced from deck_concept_mastery (question performance), NOT FSRS.
 */
import { Button } from '@/components/ui/button';
import { BookOpen, CheckCircle2, AlertCircle, X as XIcon } from 'lucide-react';
import type { ConceptMasterySummary } from '@/hooks/useConceptMastery';

interface ConceptStatsCardProps {
  summary: ConceptMasterySummary;
  onPracticeWeak: () => void;
}

const ConceptStatsCard = ({ summary, onPracticeWeak }: ConceptStatsCardProps) => {
  const { total, strong, learning, weak } = summary;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-center mb-4">
        <div className="text-center">
          <span className="font-display text-4xl sm:text-5xl font-bold text-foreground">
            {total}
          </span>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            conceitos identificados
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 sm:gap-8 mb-4 sm:mb-6">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{strong}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Fortes</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{learning}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Parciais</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <XIcon className="h-4 w-4 text-destructive" />
            <span className="text-lg sm:text-2xl font-bold text-foreground">{weak}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Fracos</span>
        </div>
      </div>

      <Button className="w-full gap-2" onClick={onPracticeWeak} disabled={weak === 0 && learning === 0}>
        <BookOpen className="h-4 w-4" />
        Praticar conceitos fracos ({weak + learning})
      </Button>
    </div>
  );
};

export default ConceptStatsCard;
