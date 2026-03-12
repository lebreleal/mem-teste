/**
 * DeckConceptsSection — shows concepts linked to questions in this deck.
 * Contextual info with mastery badges.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BrainCircuit } from 'lucide-react';

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

const DeckConceptsSection = ({ deckId, sourceDeckId }: { deckId: string; sourceDeckId?: string | null }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const effectiveDeckId = sourceDeckId ?? deckId;

  const { data: concepts = [] } = useQuery({
    queryKey: ['deck-concepts-contextual', effectiveDeckId, user?.id],
    queryFn: async (): Promise<DeckConcept[]> => {
      if (!user) return [];

      // Get question IDs for this deck
      const { data: questions } = await supabase
        .from('deck_questions' as any)
        .select('id')
        .eq('deck_id', effectiveDeckId);

      if (!questions || questions.length === 0) return [];

      const qIds = (questions as any[]).map(q => q.id);

      // Get concept IDs linked to these questions
      const { data: links } = await supabase
        .from('question_concepts' as any)
        .select('concept_id')
        .in('question_id', qIds);

      if (!links || links.length === 0) return [];

      const conceptIds = [...new Set((links as any[]).map(l => l.concept_id))];

      // Fetch user's global concepts
      const { data: gc } = await supabase
        .from('global_concepts' as any)
        .select('id, name, state, correct_count, wrong_count')
        .eq('user_id', user.id)
        .in('id', conceptIds);

      return (gc ?? []) as unknown as DeckConcept[];
    },
    enabled: !!user && !!effectiveDeckId,
    staleTime: 60_000,
  });

  if (concepts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <BrainCircuit className="h-3.5 w-3.5" /> Conceitos deste baralho
      </p>
      <div className="flex flex-wrap gap-1.5">
        {concepts.map(c => {
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
    </div>
  );
};

export default DeckConceptsSection;
