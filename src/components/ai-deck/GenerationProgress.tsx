/**
 * Polished generation progress with smooth progress bar and animated credits counter.
 */

import { useEffect, useState, useRef } from 'react';
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

/** Smoothly animated number that counts up to target */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>();
  const startRef = useRef({ value: 0, time: 0 });

  useEffect(() => {
    if (value === display) return;
    const start = display;
    const startTime = performance.now();
    const duration = 600; // ms

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (value - start) * eased);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <span>{display}</span>;
}

const GenerationProgress = ({ genProgress, onDismiss, canDismiss }: GenerationProgressProps) => {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setPhaseIdx(p => (p + 1) % PHASES.length), 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  // Smooth progress: interpolate between actual progress steps
  const hasBatches = genProgress.total > 0;
  const actualPercent = hasBatches ? Math.round((genProgress.current / genProgress.total) * 100) : 0;

  useEffect(() => {
    if (!hasBatches) return;
    // When actual progress jumps, smoothly animate towards it
    // Also add a slow "fake" progress between steps to feel alive
    setSmoothProgress(prev => Math.max(prev, actualPercent));
  }, [actualPercent, hasBatches]);

  // Slow fake progress between real updates (max 2% ahead of last real value)
  useEffect(() => {
    if (!hasBatches || actualPercent >= 100) return;
    const maxFake = Math.min(actualPercent + 8, 99);
    const iv = setInterval(() => {
      setSmoothProgress(prev => {
        if (prev >= maxFake) return prev;
        return prev + 1;
      });
    }, 800);
    return () => clearInterval(iv);
  }, [actualPercent, hasBatches]);

  const phase = PHASES[phaseIdx];
  const PhaseIcon = phase.icon;

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 gap-6 animate-fade-in">
      {/* Pulsing icon */}
      <div className="relative flex items-center justify-center h-20 w-20">
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-1 rounded-full bg-primary/5" />
        <PhaseIcon className="relative z-10 h-8 w-8 text-primary transition-all duration-500" key={phaseIdx} />
      </div>

      {/* Status text */}
      <div className="text-center space-y-1 min-h-[2.5rem]">
        <p className="text-sm font-semibold text-foreground animate-fade-in" key={phaseIdx}>
          {phase.text}
        </p>
      </div>

      {/* Progress bar */}
      {hasBatches && (
        <div className="w-full max-w-xs space-y-2">
          <div className="relative">
            <Progress
              value={smoothProgress}
              className="h-3 bg-muted/50"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Lote {Math.min(genProgress.current + 1, genProgress.total)} de {genProgress.total}</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {smoothProgress}%
            </span>
          </div>
        </div>
      )}

      {/* Animated credits counter */}
      {hasBatches && genProgress.creditsUsed > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">
            <span className="font-bold text-primary tabular-nums">
              <AnimatedNumber value={genProgress.creditsUsed} />
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
