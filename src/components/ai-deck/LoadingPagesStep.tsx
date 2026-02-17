/**
 * Loading pages indicator (PDF/document extraction).
 */

import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { LoadProgress } from './types';

interface LoadingPagesStepProps {
  loadProgress: LoadProgress;
}

const LoadingPagesStep = ({ loadProgress }: LoadingPagesStepProps) => (
  <div className="flex flex-col items-center justify-center py-12 gap-4">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
    <p className="text-sm text-muted-foreground">
      Processando página {loadProgress.current} de {loadProgress.total}...
    </p>
    {loadProgress.total > 0 && (
      <Progress value={(loadProgress.current / loadProgress.total) * 100} className="h-2 w-48" />
    )}
  </div>
);

export default LoadingPagesStep;
