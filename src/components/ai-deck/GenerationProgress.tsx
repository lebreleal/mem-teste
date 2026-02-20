/**
 * Clean, minimal loading animation during AI deck generation.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPhaseIdx(p => (p + 1) % PHASES.length), 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const hasBatches = genProgress.total > 0;
  const progressValue = hasBatches ? (genProgress.current / genProgress.total) * 100 : 0;
  const phase = PHASES[phaseIdx];
  const PhaseIcon = phase.icon;

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 gap-8 animate-fade-in">
      {/* Pulsing icon */}
      <div className="relative flex items-center justify-center h-20 w-20">
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-1 rounded-full bg-primary/5" />
        <PhaseIcon className="relative z-10 h-8 w-8 text-primary transition-all duration-500" key={phaseIdx} />
      </div>

      {/* Status text */}
      <div className="text-center space-y-1.5 min-h-[3rem]">
        <p className="text-sm font-semibold text-foreground animate-fade-in" key={phaseIdx}>
          {phase.text}
        </p>
        {hasBatches && genProgress.current > 0 && (
          <p className="text-xs text-muted-foreground">
            Lote {genProgress.current} de {genProgress.total}
          </p>
        )}
      </div>

      {/* Progress dots */}
      {hasBatches && (
        <div className="flex items-center gap-2">
          {Array.from({ length: genProgress.total }, (_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-500 ${
                i < genProgress.current
                  ? 'w-6 bg-primary'
                  : i === genProgress.current
                    ? 'w-4 bg-primary/50 animate-pulse'
                    : 'w-2 bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>
      )}

      {/* Credits used */}
      {hasBatches && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{genProgress.creditsUsed}</span> créditos usados
        </p>
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
