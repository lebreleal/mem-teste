/**
 * Progress indicator for card generation — synced with real batch progress.
 */

import { Loader2, Brain, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Step, GenProgress } from './types';

interface GenerationProgressProps {
  step: Step;
  genProgress: GenProgress;
}

const GenerationProgress = ({ step, genProgress }: GenerationProgressProps) => {
  const isGenerating = step === 'generating';
  const hasBatches = isGenerating && genProgress.total > 0;
  const progressValue = hasBatches ? (genProgress.current / genProgress.total) * 100 : 0;

  // Determine real status message based on actual state
  const getMessage = () => {
    if (step === 'analyzing') return { title: 'Analisando cobertura...', sub: 'Comparando seus cartões com o material' };
    if (!hasBatches) return { title: 'Preparando conteúdo...', sub: 'Organizando as páginas selecionadas' };
    if (genProgress.current < genProgress.total) {
      return {
        title: `Gerando cartões — lote ${genProgress.current} de ${genProgress.total}`,
        sub: 'A IA está criando perguntas, clozes e múltipla escolha',
      };
    }
    return { title: 'Finalizando...', sub: 'Organizando seus cartões' };
  };

  const msg = getMessage();

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-5 animate-fade-in">
      {/* Icon */}
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
        {hasBatches && genProgress.current >= genProgress.total ? (
          <Sparkles className="h-6 w-6 text-primary" />
        ) : step === 'analyzing' ? (
          <Brain className="h-6 w-6 text-primary" />
        ) : (
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        )}
      </div>

      {/* Status */}
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">{msg.title}</p>
        <p className="text-xs text-muted-foreground">{msg.sub}</p>
      </div>

      {/* Progress bar */}
      {hasBatches && (
        <div className="w-56 space-y-2">
          <Progress value={progressValue} className="h-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{Math.round(progressValue)}%</span>
            <span>
              <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{genProgress.creditsUsed}</span> créditos
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationProgress;
