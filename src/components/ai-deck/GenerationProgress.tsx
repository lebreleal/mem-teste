/**
 * Generation progress with real-time ETA based on actual batch durations.
 */

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Brain, Lightbulb, Sparkles, Zap, X, AlertTriangle, Clock } from 'lucide-react';
import type { GenProgress } from './types';

interface GenerationProgressProps {
  genProgress: GenProgress;
  onDismiss?: () => void;
  canDismiss?: boolean;
}

const TIPS = [
  '💡 Flashcards aumentam retenção em até 50%',
  '🧠 Repetição espaçada é a técnica mais eficaz de estudo',
  '📚 Sessões curtas e frequentes superam maratonas',
  '🎯 Testar a si mesmo é melhor que apenas reler',
  '⚡ 20 min de revisão ativa > 2h de leitura passiva',
  '🏆 Estudar um pouco todo dia é o segredo',
];

const CONCURRENT_BATCHES = 3;

function getPhase(percent: number): { icon: typeof BookOpen; text: string } {
  if (percent <= 0) return { icon: BookOpen, text: 'Iniciando geração...' };
  if (percent <= 30) return { icon: Brain, text: 'Processando conteúdo...' };
  if (percent <= 70) return { icon: Lightbulb, text: 'Gerando flashcards...' };
  if (percent < 100) return { icon: Sparkles, text: 'Finalizando cartões...' };
  return { icon: Zap, text: 'Concluído!' };
}

function formatTime(ms: number): string {
  if (ms <= 10_000) return 'Quase pronto...';
  const seconds = Math.round(ms / 1000);
  if (seconds > 90) {
    const mins = Math.ceil(seconds / 60);
    return `~${mins} min restantes`;
  }
  return `~${seconds}s restantes`;
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

const GenerationProgress = ({ genProgress, onDismiss, canDismiss }: GenerationProgressProps) => {
  const [tipIdx, setTipIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  // Tick every second for elapsed time + smooth progress
  useEffect(() => {
    const iv = setInterval(() => {
      setNow(Date.now());
      setDisplayPercent(prev => {
        if (genProgress.total <= 0) return 0;
        if (genProgress.current >= genProgress.total) return 100;

        const realPercent = (genProgress.current / genProgress.total) * 100;
        const nextCheckpoint = ((genProgress.current + 1) / genProgress.total) * 100;
        const ceiling = realPercent + (nextCheckpoint - realPercent) * 0.9;

        if (prev < realPercent) {
          return realPercent;
        }

        const distToCeiling = ceiling - prev;
        const increment = Math.max(0.15, distToCeiling * 0.04);
        return Math.min(ceiling, prev + increment);
      });
    }, 1500);
    return () => clearInterval(iv);
  }, [genProgress.current, genProgress.total]);

  const hasBatches = genProgress.total > 0;
  const smoothPercent = hasBatches
    ? (genProgress.current >= genProgress.total ? 100 : Math.round(displayPercent))
    : 0;
  const phase = getPhase(smoothPercent);
  const PhaseIcon = phase.icon;

  const eta = useMemo(() => {
    if (!hasBatches || genProgress.current === 0) return null;
    if (genProgress.current >= genProgress.total) return null;
    const remainingGroups = Math.ceil((genProgress.total - genProgress.current) / CONCURRENT_BATCHES);
    return remainingGroups * genProgress.avgBatchMs;
  }, [hasBatches, genProgress.current, genProgress.total, genProgress.avgBatchMs]);

  const elapsed = genProgress.startedAt > 0 ? now - genProgress.startedAt : 0;

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
          key={smoothPercent > 70 ? 'final' : smoothPercent > 30 ? 'mid' : 'start'}
        />
      </div>

      {/* Status text */}
      <div className="text-center space-y-1 min-h-[2.5rem]">
        <p className="text-sm font-semibold text-foreground">
          {phase.text}
        </p>
        {/* ETA */}
        {hasBatches && genProgress.current > 0 && genProgress.current < genProgress.total && eta !== null && (
          <p className="text-xs text-muted-foreground tabular-nums flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(eta)}
          </p>
        )}
      </div>

      {/* Smooth progress bar */}
      {hasBatches && (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <Progress
            value={smoothPercent}
            className="h-2.5 w-full bg-muted/40"
            style={{
              ['--progress-transition' as string]: 'width 700ms ease-out',
            }}
          />
          <div className="flex justify-between w-full text-xs text-muted-foreground tabular-nums">
            <span>Gerando cartões...</span>
            {elapsed > 0 && <span>{formatElapsed(elapsed)} decorridos</span>}
          </div>
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
