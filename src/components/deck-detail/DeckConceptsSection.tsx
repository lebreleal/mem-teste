/**
 * DeckConceptsSection — shows concepts linked to questions in this deck + sub-decks.
 * Uses hierarchy to aggregate concepts from all descendant decks.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchDeckConceptsByHierarchy, type DeckConcept } from '@/services/uiQueryService';
import { useAuth } from '@/hooks/useAuth';
import { BrainCircuit, ChevronDown, ChevronUp } from 'lucide-react';


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
    queryFn: () => fetchDeckConceptsByHierarchy(effectiveDeckId, user!.id),
    enabled: !!user && !!effectiveDeckId,
    staleTime: 60_000,
  });

  if (concepts.length === 0) return null;

  const visibleConcepts = expanded ? concepts : concepts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = concepts.length - VISIBLE_LIMIT;

  return (
    <div className="space-y-1.5 mt-2">
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
              <ChevronDown className="h-3 w-3" /> Ver mais {hiddenCount} tags
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default DeckConceptsSection;
