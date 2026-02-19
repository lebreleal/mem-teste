import { useState, useEffect } from 'react';
import { BookOpen, Search, Sparkles } from 'lucide-react';

const phases = [
  { icon: BookOpen, label: 'Lendo cartão...' },
  { icon: Search, label: 'Buscando fonte confiável...' },
  { icon: Sparkles, label: 'Elaborando explicação...' },
];

const TutorLoadingAnimation = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(prev => (prev + 1) % phases.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const { icon: Icon, label } = phases[phase];

  return (
    <div
      className="card-premium w-full border border-primary/20 bg-primary/5 p-4 animate-fade-in"
      style={{ borderRadius: 'var(--radius)' }}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon
              key={phase}
              className="h-4 w-4 text-primary animate-pulse"
            />
          </div>
          {/* Pulse ring */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            key={phase}
            className="text-sm font-display font-semibold text-primary animate-fade-in"
          >
            {label}
          </p>
          {/* Shimmer bar */}
          <div className="mt-2 h-1 w-full rounded-full bg-primary/10 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-primary/40 animate-shimmer" />
          </div>
        </div>
      </div>
      {/* Phase dots */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {phases.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === phase ? 'w-4 bg-primary' : 'w-1.5 bg-primary/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default TutorLoadingAnimation;
