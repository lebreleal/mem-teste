/**
 * DeckConceptsSection — shows concepts linked to questions in this deck + sub-decks.
 * Uses hierarchy to aggregate concepts from all descendant decks.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BrainCircuit, ChevronDown, ChevronUp } from 'lucide-react';

interface DeckConcept {
  id: string;
  name: string;
  state: number;
  correct_count: number;
  wrong_count: number;
}

const STATE_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'Novo', className: 'bg-muted text-muted-foreground' },
  1: { label: 'Aprendendo', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  2: { label: 'Revisão', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  3: { label: 'Reaprendendo', className: 'bg-destructive/15 text-destructive' },
};

const VISIBLE_LIMIT = 8;

const DeckConceptsSection = ({ deckId, sourceDeckId }: { deckId: string; sourceDeckId?: string | null }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const effectiveDeckId = sourceDeckId ?? deckId;
  const [expanded, setExpanded] = useState(false);

  const { data: concepts = [] } = useQuery({
    queryKey: ['deck-concepts-contextual', effectiveDeckId, user?.id],
    queryFn: async (): Promise<DeckConcept[]> => {
      if (!user) return [];

      // 1. Get all deck IDs in hierarchy (BFS descendants)
      const allDeckIds: string[] = [effectiveDeckId];
      let frontier = [effectiveDeckId];
      while (frontier.length > 0) {
        const { data: children } = await supabase
          .from('decks')
          .select('id')
          .in('parent_deck_id', frontier)
          .eq('user_id', user.id);
        if (!children || children.length === 0) break;
        const childIds = children.map((d: any) => d.id);
        allDeckIds.push(...childIds);
        frontier = childIds;
      }

      // 2. Get question IDs for all decks in hierarchy
      const { data: questions } = await supabase
        .from('deck_questions' as any)
        .select('id')
        .in('deck_id', allDeckIds);

      if (!questions || questions.length === 0) return [];

      const qIds = (questions as any[]).map(q => q.id);

      // 3. Get concept IDs linked to these questions (batch if needed)
      const allConceptIds: string[] = [];
      for (let i = 0; i < qIds.length; i += 100) {
        const batch = qIds.slice(i, i + 100);
        const { data: links } = await supabase
          .from('question_concepts' as any)
          .select('concept_id')
          .in('question_id', batch);
        if (links) {
          allConceptIds.push(...(links as any[]).map(l => l.concept_id));
        }
      }

      if (allConceptIds.length === 0) return [];

      const uniqueConceptIds = [...new Set(allConceptIds)];

      // 4. Fetch user's global concepts
      const { data: gc } = await supabase
        .from('global_concepts' as any)
        .select('id, name, state, correct_count, wrong_count')
        .eq('user_id', user.id)
        .in('id', uniqueConceptIds);

      return (gc ?? []) as unknown as DeckConcept[];
    },
    enabled: !!user && !!effectiveDeckId,
    staleTime: 60_000,
  });

  if (concepts.length === 0) return null;

  const visibleConcepts = expanded ? concepts : concepts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = concepts.length - VISIBLE_LIMIT;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <BrainCircuit className="h-3.5 w-3.5" /> Tags ({concepts.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visibleConcepts.map(c => {
          const info = STATE_LABELS[c.state] ?? STATE_LABELS[0];
          return (
            <button
              key={c.id}
              onClick={() => navigate('/conceitos', { state: { filterConcept: c.name } })}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${info.className}`}
            >
              {c.name}
              <span className="text-[9px] opacity-70">({info.label})</span>
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Ver mais {hiddenCount} conceitos
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default DeckConceptsSection;
