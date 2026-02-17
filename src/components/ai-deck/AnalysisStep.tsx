/**
 * Coverage analysis step: shows coverage %, missing topics, and fill-gaps action.
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, Plus } from 'lucide-react';
import type { CoverageAnalysis } from './types';

interface AnalysisStepProps {
  analysis: CoverageAnalysis;
  onBack: () => void;
  onFillGaps: () => void;
}

const AnalysisStep = ({ analysis, onBack, onFillGaps }: AnalysisStepProps) => (
  <div className="flex flex-col gap-3 flex-1 min-h-0">
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[60dvh] sm:max-h-[65vh]">
      <div className="space-y-5">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mx-auto">
            <span className="text-2xl font-bold text-primary">{analysis.coveragePercent}%</span>
          </div>
          <p className="text-sm font-semibold text-foreground">Cobertura do conteúdo</p>
          <Progress value={analysis.coveragePercent} className="h-2" />
          <p className="text-xs text-muted-foreground">{analysis.summary}</p>
        </div>

        {analysis.missingTopics.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Tópicos não cobertos:</Label>
            <div className="flex flex-wrap gap-1.5">
              {analysis.missingTopics.map((t, i) => (
                <span key={i} className="text-[10px] bg-muted px-2 py-1 rounded-full text-muted-foreground">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    <div className="flex gap-2 pt-2 border-t border-border/50">
      <Button variant="outline" onClick={onBack} className="gap-1.5">
        <ChevronLeft className="h-3.5 w-3.5" /> Voltar
      </Button>
      {analysis.coveragePercent < 95 && (
        <Button onClick={onFillGaps} className="flex-1 gap-2">
          <Plus className="h-4 w-4" /> Criar cartões para o que falta
        </Button>
      )}
    </div>
  </div>
);

export default AnalysisStep;
