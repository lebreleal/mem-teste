/**
 * DeckConceptMap — "Conquest line" visualization of concepts per deck.
 * Shows a linear progression of concepts from basic → advanced,
 * ordered by prerequisite graph (topological sort).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDecks } from '@/hooks/useDecks';
import type { GlobalConcept } from '@/services/globalConceptService';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Circle, Loader2, Lock, ChevronRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

interface DeckConceptMapProps {
  concepts: GlobalConcept[];
  onStartStudy?: (concept: GlobalConcept) => void;
}

/** Fetch concept-to-deck mapping via question_concepts → deck_questions */
async function fetchConceptDeckMap(userId: string): Promise<Record<string, Set<string>>> {
  // Get all user's concept IDs
  const { data: userConcepts } = await supabase
    .from('global_concepts' as any)
    .select('id')
    .eq('user_id', userId);

  if (!userConcepts || userConcepts.length === 0) return {};

  const conceptIds = (userConcepts as any[]).map((c: any) => c.id);

  // Get concept → question links
  const PAGE = 1000;
  const allLinks: { concept_id: string; question_id: string }[] = [];
  for (let i = 0; i < conceptIds.length; i += 300) {
    const batch = conceptIds.slice(i, i + 300);
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('question_concepts' as any)
        .select('concept_id, question_id')
        .in('concept_id', batch)
        .range(offset, offset + PAGE - 1);
      const chunk = (data ?? []) as any[];
      allLinks.push(...chunk);
      hasMore = chunk.length === PAGE;
      offset += PAGE;
    }
  }

  if (allLinks.length === 0) return {};

  // Get question → deck mapping
  const questionIds = [...new Set(allLinks.map(l => l.question_id))];
  const questionDeckMap = new Map<string, string>();
  for (let i = 0; i < questionIds.length; i += 300) {
    const batch = questionIds.slice(i, i + 300);
    const { data } = await supabase
      .from('deck_questions' as any)
      .select('id, deck_id')
      .in('id', batch);
    for (const q of (data ?? []) as any[]) {
      questionDeckMap.set(q.id, q.deck_id);
    }
  }

  // Build concept → Set<deckId>
  const result: Record<string, Set<string>> = {};
  for (const link of allLinks) {
    const deckId = questionDeckMap.get(link.question_id);
    if (deckId) {
      if (!result[link.concept_id]) result[link.concept_id] = new Set();
      result[link.concept_id].add(deckId);
    }
  }
  return result;
}

/** Topological sort concepts by parent_concept_id */
function topoSort(concepts: GlobalConcept[]): GlobalConcept[] {
  const byId = new Map(concepts.map(c => [c.id, c]));
  const visited = new Set<string>();
  const result: GlobalConcept[] = [];

  function visit(c: GlobalConcept) {
    if (visited.has(c.id)) return;
    visited.add(c.id);
    // Visit parent first
    if (c.parent_concept_id && byId.has(c.parent_concept_id)) {
      visit(byId.get(c.parent_concept_id)!);
    }
    result.push(c);
  }

  for (const c of concepts) visit(c);
  return result;
}

function ConceptNode({ concept, isLocked }: { concept: GlobalConcept; isLocked: boolean }) {
  const isDominated = concept.state === 2;
  const isLearning = concept.state === 1 || concept.state === 3;
  const isNew = concept.state === 0;
  const totalAttempts = concept.correct_count + concept.wrong_count;
  const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;

  return (
    <div className="flex items-center gap-2.5 group">
      {/* Node icon */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        isDominated
          ? 'border-green-500 bg-green-500/10 text-green-500'
          : isLearning
            ? 'border-amber-500 bg-amber-500/10 text-amber-500'
            : isLocked
              ? 'border-muted-foreground/30 bg-muted/50 text-muted-foreground/40'
              : 'border-border bg-background text-muted-foreground'
      }`}>
        {isDominated ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isLocked ? (
          <Lock className="h-3 w-3" />
        ) : isLearning ? (
          <Loader2 className="h-3.5 w-3.5" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${
          isDominated ? 'text-green-600 dark:text-green-400' :
          isLocked ? 'text-muted-foreground/50' :
          'text-foreground'
        }`}>
          {concept.name}
        </p>
        {totalAttempts > 0 && (
          <p className="text-[10px] text-muted-foreground">{accuracy}% · {totalAttempts} tentativas</p>
        )}
      </div>
    </div>
  );
}

function DeckMapSection({ deckId, deckName, concepts, allConcepts, onStartStudy }: {
  deckId: string;
  deckName: string;
  concepts: GlobalConcept[];
  allConcepts: GlobalConcept[];
  onStartStudy?: (concept: GlobalConcept) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => topoSort(concepts), [concepts]);

  const lockedIds = useMemo(() => {
    const byId = new Map(allConcepts.map(c => [c.id, c]));
    const locked = new Set<string>();
    for (const c of concepts) {
      if (c.parent_concept_id) {
        const parent = byId.get(c.parent_concept_id);
        if (parent && parent.state !== 2) locked.add(c.id);
      }
    }
    return locked;
  }, [concepts, allConcepts]);

  const dominated = concepts.filter(c => c.state === 2).length;
  const total = concepts.length;
  const progressPct = total > 0 ? Math.round((dominated / total) * 100) : 0;
  const isComplete = dominated === total && total > 0;

  // Find first concept that can be studied (not locked, not dominated)
  const nextStudyable = sorted.find(c => c.state !== 2 && !lockedIds.has(c.id));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/50 ${isComplete ? 'opacity-60' : ''}`}>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground truncate">{deckName}</h4>
              {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={progressPct} className="h-1.5 flex-1" />
              <span className="text-[10px] text-muted-foreground shrink-0">{dominated}/{total}</span>
            </div>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 mt-1 border-l-2 border-border/50 pl-4 pb-2 space-y-0.5">
          {sorted.map((concept, i) => (
            <div key={concept.id} className="py-1">
              <ConceptNode concept={concept} isLocked={lockedIds.has(concept.id)} />
              {/* Connector line between nodes */}
              {i < sorted.length - 1 && (
                <div className="ml-3.5 h-2 border-l-2 border-dashed border-border/40" />
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2">
            {nextStudyable && onStartStudy && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-[11px]" onClick={() => onStartStudy(nextStudyable)}>
                <Play className="h-3 w-3" /> Estudar próximo
              </Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-[11px]" onClick={() => navigate(`/decks/${deckId}`)}>
              Ver baralho <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function DeckConceptMap({ concepts, onStartStudy }: DeckConceptMapProps) {
  const { user } = useAuth();
  const { decks } = useDecks();

  const { data: conceptDeckMap, isLoading } = useQuery({
    queryKey: ['concept-deck-map', user?.id],
    queryFn: () => fetchConceptDeckMap(user!.id),
    enabled: !!user && concepts.length > 0,
    staleTime: 30_000,
  });

  // Group concepts by deck
  const deckGroups = useMemo(() => {
    if (!conceptDeckMap || !decks) return [];

    const deckMap = new Map<string, GlobalConcept[]>();
    const unlinked: GlobalConcept[] = [];

    for (const concept of concepts) {
      const deckIds = conceptDeckMap[concept.id];
      if (!deckIds || deckIds.size === 0) {
        unlinked.push(concept);
        continue;
      }
      // Add to primary deck (first one)
      const primaryDeckId = [...deckIds][0];
      if (!deckMap.has(primaryDeckId)) deckMap.set(primaryDeckId, []);
      deckMap.get(primaryDeckId)!.push(concept);
    }

    // Find root deck for each deck ID
    const getRootId = (id: string): string => {
      const d = decks.find(x => x.id === id);
      if (!d || !d.parent_deck_id) return id;
      return getRootId(d.parent_deck_id);
    };

    // Merge sub-deck concepts into root deck groups
    const rootGroups = new Map<string, GlobalConcept[]>();
    for (const [deckId, deckConcepts] of deckMap) {
      const rootId = getRootId(deckId);
      if (!rootGroups.has(rootId)) rootGroups.set(rootId, []);
      rootGroups.get(rootId)!.push(...deckConcepts);
    }

    const groups = [...rootGroups.entries()].map(([deckId, deckConcepts]) => {
      const deck = decks.find(d => d.id === deckId);
      return {
        deckId,
        deckName: deck?.name ?? 'Baralho',
        concepts: deckConcepts,
      };
    });

    // Sort: incomplete first, then by name
    groups.sort((a, b) => {
      const aDone = a.concepts.every(c => c.state === 2);
      const bDone = b.concepts.every(c => c.state === 2);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a.deckName.localeCompare(b.deckName);
    });

    // Add unlinked at the end if any
    if (unlinked.length > 0) {
      groups.push({ deckId: '__unlinked__', deckName: 'Sem baralho', concepts: unlinked });
    }

    return groups;
  }, [concepts, conceptDeckMap, decks]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (deckGroups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {deckGroups.map(group => (
        <DeckMapSection
          key={group.deckId}
          deckId={group.deckId}
          deckName={group.deckName}
          concepts={group.concepts}
          allConcepts={concepts}
          onStartStudy={onStartStudy}
        />
      ))}
    </div>
  );
}
