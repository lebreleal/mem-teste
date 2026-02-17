/**
 * Elegant loading animation with rotating status phases + tips.
 */

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Sparkles, BookOpen, Brain, Lightbulb, Zap, X } from 'lucide-react';
import type { GenProgress } from './types';

interface GenerationProgressProps {
  genProgress: GenProgress;
  onDismiss?: () => void;
  canDismiss?: boolean;
}

const PHASES = [
  { icon: BookOpen, text: 'Extraindo conteúdo do material...', color: 'text-primary' },
  { icon: Brain, text: 'Analisando conceitos-chave...', color: 'text-primary' },
  { icon: Lightbulb, text: 'Criando perguntas inteligentes...', color: 'text-primary' },
  { icon: Sparkles, text: 'Gerando flashcards de alta qualidade...', color: 'text-primary' },
  { icon: Zap, text: 'Finalizando seus cartões...', color: 'text-primary' },
];

const TIPS = [
  '💡 Flashcards aumentam retenção em até 50%',
  '🧠 Repetição espaçada é a técnica mais eficaz',
  '📚 Intervalos curtos superam sessões longas',
  '🎯 Testar a si mesmo > reler o material',
  '⚡ 20 min de revisão ativa > 2h de leitura',
  '🏆 Consistência diária é o segredo',
  '🔄 Espaçar revisões consolida a memória',
  '✨ Cartões próprios são mais eficazes que prontos',
];

const GenerationProgress = ({ genProgress, onDismiss, canDismiss }: GenerationProgressProps) => {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Cycle phases every 3s
  useEffect(() => {
    const iv = setInterval(() => setPhaseIdx(p => (p + 1) % PHASES.length), 3000);
    return () => clearInterval(iv);
  }, []);

  // Cycle tips every 5s
  useEffect(() => {
    const iv = setInterval(() => setTipIdx(p => (p + 1) % TIPS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  // Track elapsed time
  useEffect(() => {
    const iv = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const hasBatches = genProgress.total > 0;
  const progressValue = hasBatches ? (genProgress.current / genProgress.total) * 100 : 0;
  const phase = PHASES[phaseIdx];
  const PhaseIcon = phase.icon;

  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 gap-6 animate-fade-in">
      {/* Animated orb */}
      <div className="relative flex items-center justify-center">
        {/* Outer ring - slow spin */}
        <div className="absolute h-24 w-24 rounded-full border-2 border-primary/20 animate-[spin_8s_linear_infinite]" />
        {/* Middle ring - medium spin */}
        <div className="absolute h-20 w-20 rounded-full border-2 border-dashed border-primary/30 animate-[spin_4s_linear_infinite_reverse]" />
        {/* Inner glow */}
        <div className="absolute h-16 w-16 rounded-full bg-primary/10 animate-pulse" />
        {/* Icon */}
        <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25 backdrop-blur-sm">
          <PhaseIcon className={`h-6 w-6 ${phase.color} transition-all duration-500`} />
        </div>
      </div>

      {/* Phase status */}
      <div className="text-center space-y-2 min-h-[3.5rem]">
        <p className="text-sm font-semibold text-foreground transition-all duration-500 animate-fade-in" key={phaseIdx}>
          {hasBatches && genProgress.current > 0 && genProgress.current <= genProgress.total
            ? `Lote ${genProgress.current} de ${genProgress.total} — ${phase.text}`
            : phase.text
          }
        </p>
        <p className="text-xs text-muted-foreground/80 transition-all duration-700" key={`tip-${tipIdx}`}>
          {TIPS[tipIdx]}
        </p>
      </div>

      {/* Progress bar */}
      {hasBatches && (
        <div className="w-64 space-y-2">
          <Progress value={progressValue} className="h-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{Math.round(progressValue)}%</span>
            <span>
              <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{genProgress.creditsUsed}</span> créditos
            </span>
          </div>
        </div>
      )}

      {/* Dismiss button — appears after 10s */}
      {canDismiss && elapsed >= 10 && onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-1.5 animate-fade-in"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
          Fechar e continuar em segundo plano
        </Button>
      )}
    </div>
  );
};

export default GenerationProgress;
