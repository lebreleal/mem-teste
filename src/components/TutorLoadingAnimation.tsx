import { useState, useEffect } from 'react';
import { BookOpen, Search, Sparkles } from 'lucide-react';

const phases = [
  { icon: BookOpen, label: 'Lendo cartão...' },
  { icon: Search, label: 'Buscando fonte confiável...' },
  { icon: Sparkles, label: 'Elaborando explicação...' },
];

/** Compact inline loading – cycles icon + text inside a button-sized area */
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
    <span className="inline-flex items-center gap-2">
      <Icon key={phase} className="h-3.5 w-3.5 animate-pulse" />
      <span key={`l-${phase}`} className="animate-fade-in">{label}</span>
    </span>
  );
};

export default TutorLoadingAnimation;
