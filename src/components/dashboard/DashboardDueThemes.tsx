/**
 * DashboardDueThemes — Compact "due themes" section for the unified Home.
 * Shows themes that need review. "Estudar" navigates to linked flashcard decks
 * for retrieval practice (instead of multiple-choice quiz).
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import { ChevronDown, ChevronRight, Play, BrainCircuit, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GlobalConcept } from '@/services/globalConceptService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const DashboardDueThemes = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { concepts, dueConcepts } = useGlobalConcepts();
  const [collapsed, setCollapsed] = useState(false);

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

  /** Navigate to the deck that has cards linked to this concept */
  const handleStudyConcept = useCallback(async (concept: GlobalConcept) => {
    if (!user) return;
    try {
      // Find questions linked to this concept
      const { data: links } = await supabase
        .from('question_concepts' as any)
        .select('question_id')
        .eq('concept_id', concept.id)
        .limit(1);

      if (!links || links.length === 0) {
        // No linked questions — go to concepts page
        navigate('/conceitos');
        return;
      }

      // Get deck from first linked question
      const { data: question } = await supabase
        .from('deck_questions' as any)
        .select('deck_id')
        .eq('id', (links as any[])[0].question_id)
        .maybeSingle();

      if (question && (question as any).deck_id) {
        navigate(`/study/${(question as any).deck_id}`);
      } else {
        navigate('/conceitos');
      }
    } catch {
      navigate('/conceitos');
    }
  }, [user, navigate]);

  /** Study all due concepts — navigate to first linked deck */
  const handleStudyAll = useCallback(async () => {
    const queue = dueCount > 0 ? dueConcepts : frontierConcepts;
    if (queue.length === 0) return;
    // Navigate to first concept's deck
    await handleStudyConcept(queue[0]);
  }, [dueConcepts, frontierConcepts, dueCount, handleStudyConcept]);

  if (dueCount === 0 && frontierConcepts.length === 0) return null;

  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const totalItems = dueCount + (dueCount === 0 ? frontierConcepts.length : 0);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden mb-4">
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
              onClick={() => handleStudyConcept(concept)}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary/60 shrink-0" />
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
