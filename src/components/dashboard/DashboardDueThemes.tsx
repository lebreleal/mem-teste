/**
 * DashboardDueThemes — Compact "due themes" section for the unified Home.
 * Shows themes that need review with a single "Estudar tudo" CTA.
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import { Clock, ChevronDown, ChevronRight, Play, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GlobalConcept } from '@/services/globalConceptService';
import type { Rating } from '@/lib/fsrs';
import { lazy, Suspense } from 'react';

const StudyMode = lazy(() => import('@/components/concepts/StudyMode'));

const DashboardDueThemes = () => {
  const navigate = useNavigate();
  const { concepts, dueConcepts, submitConceptReview } = useGlobalConcepts();
  const [collapsed, setCollapsed] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [studyQueue, setStudyQueue] = useState<GlobalConcept[]>([]);

  const dueCount = dueConcepts.length;

  // Also show frontier (new, unlocked) concepts
  const frontierConcepts = useMemo(() => {
    const byId = new Map(concepts.map(c => [c.id, c]));
    return concepts.filter(c => {
      if (c.state !== 0) return false;
      if (!c.parent_concept_id) return true;
      const parent = byId.get(c.parent_concept_id);
      return parent ? parent.state === 2 : true;
    }).slice(0, 5);
  }, [concepts]);

  const handleStudyAll = useCallback(() => {
    const queue = dueCount > 0 ? dueConcepts : frontierConcepts;
    if (queue.length === 0) return;
    setStudyQueue(queue);
    setStudyMode(true);
  }, [dueConcepts, frontierConcepts, dueCount]);

  const handleStudyRate = useCallback(async (concept: GlobalConcept, rating: Rating, isCorrect: boolean) => {
    await submitConceptReview.mutateAsync({ concept, rating, isCorrect });
  }, [submitConceptReview]);

  if (dueCount === 0 && frontierConcepts.length === 0) return null;

  if (studyMode && studyQueue.length > 0) {
    return (
      <Suspense fallback={null}>
        <StudyMode queue={studyQueue} onClose={() => { setStudyMode(false); setStudyQueue([]); }} onRate={handleStudyRate} />
      </Suspense>
    );
  }

  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const totalItems = dueCount + (dueCount === 0 ? frontierConcepts.length : 0);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
      >
        <Chevron className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <BrainCircuit className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">
          {dueCount > 0 ? 'Temas para revisar' : 'Temas prontos para aprender'}
        </span>
        <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{totalItems}</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary"
          onClick={e => { e.stopPropagation(); handleStudyAll(); }}
        >
          <Play className="h-2.5 w-2.5" />
          Estudar
        </Button>
      </button>

      {!collapsed && (
        <div className="px-2 pb-2 space-y-1">
          {(dueCount > 0 ? dueConcepts.slice(0, 5) : frontierConcepts).map(concept => (
            <div
              key={concept.id}
              className="flex items-center gap-2 rounded-lg bg-card/60 px-3 py-2 text-sm cursor-pointer hover:bg-card transition-colors"
              onClick={() => navigate('/conceitos')}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground truncate flex-1">{concept.name}</span>
              {concept.category && (
                <span className="text-[10px] text-muted-foreground truncate max-w-20">{concept.category}</span>
              )}
            </div>
          ))}
          {totalItems > 5 && (
            <button
              onClick={() => navigate('/conceitos')}
              className="w-full text-center text-[11px] text-primary font-medium py-1.5 hover:underline"
            >
              Ver todos ({totalItems})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardDueThemes;
