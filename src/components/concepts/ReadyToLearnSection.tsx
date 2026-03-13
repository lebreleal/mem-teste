import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { GlobalConcept } from '@/services/globalConceptService';
import { fetchReadyToLearnConcepts } from '@/services/globalConceptService';
import { Badge } from '@/components/ui/badge';
import { Unlock, Play } from 'lucide-react';

interface ReadyToLearnSectionProps {
  onStartStudy: (concept: GlobalConcept) => void;
}

const ReadyToLearnSection = ({ onStartStudy }: ReadyToLearnSectionProps) => {
  const { user } = useAuth();

  const { data: readyConcepts = [], isLoading } = useQuery({
    queryKey: ['ready-to-learn', user?.id],
    queryFn: () => fetchReadyToLearnConcepts(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  if (isLoading || readyConcepts.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Unlock className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-primary">Prontos para aprender</p>
        <Badge variant="secondary" className="text-[9px] ml-auto">{readyConcepts.length}</Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Conceitos cujos pré-requisitos já foram dominados — a fronteira do seu conhecimento.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {readyConcepts.slice(0, 8).map(c => (
          <button
            key={c.id}
            onClick={() => onStartStudy(c)}
            className="flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Play className="h-2.5 w-2.5" />
            {c.name}
          </button>
        ))}
        {readyConcepts.length > 8 && (
          <span className="text-[10px] text-muted-foreground self-center">
            +{readyConcepts.length - 8} mais
          </span>
        )}
      </div>
    </div>
  );
};

export default ReadyToLearnSection;
