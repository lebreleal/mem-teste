/**
 * Progress indicator for card generation or analysis.
 */

import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Step, GenProgress } from './types';

interface GenerationProgressProps {
  step: Step;
  genProgress: GenProgress;
}

const GenerationProgress = ({ step, genProgress }: GenerationProgressProps) => (
  <div className="flex flex-col items-center justify-center py-12 gap-4">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
    {step === 'generating' && genProgress.total > 0 ? (
      <>
        <p className="text-sm text-muted-foreground font-medium">
          Processando página {genProgress.current} de {genProgress.total}...
        </p>
        <Progress value={(genProgress.current / genProgress.total) * 100} className="h-2 w-48" />
        <p className="text-xs text-muted-foreground">
          <span style={{ color: 'hsl(var(--energy-purple))' }} className="font-bold">{genProgress.creditsUsed}</span> créditos utilizados
        </p>
      </>
    ) : (
      <p className="text-sm text-muted-foreground font-medium">Analisando cobertura...</p>
    )}
  </div>
);

export default GenerationProgress;
