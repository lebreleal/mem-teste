/**
 * ConceptStatsCard — mastery dashboard hero card for the Concepts tab.
 * Shows temporal decay warnings and cross-deck concept summary.
 */
import { Button } from '@/components/ui/button';
import { BookOpen, CheckCircle2, AlertCircle, X as XIcon, Clock, Globe } from 'lucide-react';
import type { ConceptMasterySummary } from '@/hooks/useConceptMastery';
import { useGlobalConceptMastery } from '@/hooks/useConceptMastery';

interface ConceptStatsCardProps {
  summary: ConceptMasterySummary;
  onPracticeWeak: () => void;
}

const ConceptStatsCard = ({ summary, onPracticeWeak }: ConceptStatsCardProps) => {
  const { total, strong, learning, weak } = summary;
  const { globalConcepts } = useGlobalConceptMastery();

  // Cross-deck stats
  const crossDeckConcepts = globalConcepts.filter(c => c.deckCount > 1);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 sm:p-6 shadow-sm space-y-4">
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

      {/* Cross-deck indicator */}
      {crossDeckConcepts.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-[11px] text-foreground">
            <span className="font-bold">{crossDeckConcepts.length}</span> conceito{crossDeckConcepts.length > 1 ? 's' : ''} compartilhado{crossDeckConcepts.length > 1 ? 's' : ''} entre baralhos
          </p>
        </div>
      )}

      <Button className="w-full gap-2" onClick={onPracticeWeak} disabled={weak === 0 && learning === 0}>
        <BookOpen className="h-4 w-4" />
        Praticar conceitos fracos ({weak + learning})
      </Button>

      <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <Clock className="h-3 w-3" />
        Conceitos decaem se não praticados (14d forte → parcial, 7d parcial → fraco)
      </p>
    </div>
  );
};

export default ConceptStatsCard;
