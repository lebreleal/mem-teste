/**
 * Animated progress indicator for card generation with step-by-step feedback.
 */

import { useEffect, useState } from 'react';
import { Loader2, FileSearch, BookOpen, Brain, Sparkles, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Step, GenProgress } from './types';

interface GenerationProgressProps {
  step: Step;
  genProgress: GenProgress;
}

const GENERATION_PHASES = [
  { icon: FileSearch, label: 'Extraindo conteúdo do documento...', sublabel: 'Lendo texto e imagens' },
  { icon: BookOpen, label: 'Analisando o material...', sublabel: 'Identificando conceitos-chave' },
  { icon: Brain, label: 'Gerando cartões inteligentes...', sublabel: 'Criando perguntas e respostas' },
  { icon: Sparkles, label: 'Refinando qualidade...', sublabel: 'Verificando clareza e precisão' },
  { icon: CheckCircle2, label: 'Finalizando...', sublabel: 'Preparando seus cartões' },
];

const ANALYSIS_PHASES = [
  { icon: FileSearch, label: 'Lendo seus cartões...', sublabel: 'Mapeando conteúdo existente' },
  { icon: BookOpen, label: 'Comparando com o material...', sublabel: 'Identificando lacunas' },
  { icon: Brain, label: 'Calculando cobertura...', sublabel: 'Avaliando profundidade' },
];

const GenerationProgress = ({ step, genProgress }: GenerationProgressProps) => {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [dots, setDots] = useState('');
  const phases = step === 'analyzing' ? ANALYSIS_PHASES : GENERATION_PHASES;

  // Cycle through phases
  useEffect(() => {
    setPhaseIdx(0);
    const interval = setInterval(() => {
      setPhaseIdx(prev => (prev + 1) % phases.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [step, phases.length]);

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const currentPhase = phases[phaseIdx];
  const Icon = currentPhase.icon;
  const progressValue = genProgress.total > 0 ? (genProgress.current / genProgress.total) * 100 : 0;

  return (
    <div className="flex flex-col items-center justify-center py-10 gap-6 animate-fade-in">
      {/* Animated icon */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/30">
          <Icon
            key={phaseIdx}
            className="h-7 w-7 text-primary animate-scale-in"
          />
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center space-y-1 min-h-[3rem]" key={phaseIdx}>
        <p className="text-sm font-semibold text-foreground animate-fade-in">
          {currentPhase.label.replace('...', dots.padEnd(3, '\u00A0'))}
        </p>
        <p className="text-xs text-muted-foreground animate-fade-in">
          {currentPhase.sublabel}
        </p>
      </div>

      {/* Progress bar for generation */}
      {step === 'generating' && genProgress.total > 0 && (
        <div className="w-56 space-y-2 animate-fade-in">
          <Progress value={progressValue} className="h-2" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Lote {genProgress.current} de {genProgress.total}</span>
            <span>
              <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{genProgress.creditsUsed}</span> créditos
            </span>
          </div>
        </div>
      )}

      {/* Fun tips */}
      <p className="text-[11px] text-muted-foreground/60 max-w-xs text-center italic mt-2">
        💡 Dica: quanto mais detalhado o material, melhores os cartões gerados!
      </p>
    </div>
  );
};

export default GenerationProgress;
