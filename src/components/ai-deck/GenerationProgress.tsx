/**
 * Modern generation progress with smooth bar, animated phases, and credits counter.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Brain, Lightbulb, Sparkles, Zap, X, AlertTriangle } from 'lucide-react';
import type { GenProgress } from './types';

interface GenerationProgressProps {
  genProgress: GenProgress;
  onDismiss?: () => void;
  canDismiss?: boolean;
}

const PHASES = [
  { icon: BookOpen, text: 'Extraindo conteúdo...' },
  { icon: Brain, text: 'Analisando conceitos...' },
  { icon: Lightbulb, text: 'Criando perguntas...' },
  { icon: Sparkles, text: 'Gerando flashcards...' },
  { icon: Zap, text: 'Finalizando cartões...' },
];

const TIPS = [
  '💡 Flashcards aumentam retenção em até 50%',
  '🧠 Repetição espaçada é a técnica mais eficaz',
  '📚 Intervalos curtos superam sessões longas',
  '🎯 Testar a si mesmo > reler o material',
  '⚡ 20 min de revisão ativa > 2h de leitura',
  '🏆 Consistência diária é o segredo',
];

const GenerationProgress = ({ genProgress, onDismiss, canDismiss }: GenerationProgressProps) => {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPhaseIdx(p => (p + 1) % PHASES.length), 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  const hasBatches = genProgress.total > 0;
  const progressValue = hasBatches ? Math.round((genProgress.current / genProgress.total) * 100) : 0;
  const phase = PHASES[phaseIdx];
  const PhaseIcon = phase.icon;

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 gap-6 animate-fade-in">
      {/* Orbital animation */}
      <div className="relative flex items-center justify-center h-24 w-24">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
          style={{ animation: 'spin 1.8s linear infinite' }}
        />
        <div className="absolute inset-3 rounded-full bg-primary/5 animate-pulse" />
        <PhaseIcon
          className="relative z-10 h-8 w-8 text-primary transition-all duration-500"
          key={phaseIdx}
        />
      </div>

      {/* Status text */}
      <div className="text-center space-y-1 min-h-[2.5rem]">
        <p className="text-sm font-semibold text-foreground animate-fade-in" key={phaseIdx}>
          {phase.text}
        </p>
      </div>

      {/* Smooth progress bar */}
      {hasBatches && (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <Progress
            value={progressValue}
            className="h-2.5 w-full bg-muted/40"
            style={{
              ['--progress-transition' as string]: 'width 700ms ease-out',
            }}
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            Lote {Math.min(genProgress.current + 1, genProgress.total)} de {genProgress.total}
          </span>
        </div>
      )}

      {/* Credits counter */}
      {hasBatches && genProgress.creditsUsed > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">
            <span className="font-bold text-primary tabular-nums">
              {genProgress.creditsUsed}
            </span>
            {' '}créditos usados
          </span>
        </div>
      )}

      {/* Tip */}
      <p className="text-xs text-muted-foreground/70 animate-fade-in max-w-xs text-center" key={`tip-${tipIdx}`}>
        {TIPS[tipIdx]}
      </p>

      {/* Dismiss button */}
      {canDismiss && onDismiss && (
        <div className="space-y-2 animate-fade-in">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" />
            Continuar em segundo plano
          </Button>
          <p className="text-[10px] text-destructive text-center flex items-center gap-1 justify-center">
            <AlertTriangle className="h-3 w-3" />
            Não feche o app enquanto gera
          </p>
        </div>
      )}
    </div>
  );
};

export default GenerationProgress;
