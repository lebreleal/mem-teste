/**
 * ConceptNeuralMap — Neural network / skill tree visualization.
 * Renders concepts as card-styled nodes connected by lines,
 * like a Minecraft achievement tree / neural pathway.
 * Grows infinitely as user adds more questions.
 */
import { useMemo, useState, useCallback } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { CheckCircle2, Lock, Circle, Loader2, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { stateInfo, nextReviewLabel } from './helpers';

interface ConceptNeuralMapProps {
  concepts: GlobalConcept[];
  lockedIds: Set<string>;
  onStartStudy?: (concept: GlobalConcept) => void;
  onEdit?: (concept: GlobalConcept) => void;
  onOpenQuestions?: (conceptId: string) => void;
}

interface TreeNode {
  concept: GlobalConcept;
  children: TreeNode[];
  depth: number;
}

/** Build forest from flat concept list using parent_concept_id */
function buildForest(concepts: GlobalConcept[]): TreeNode[] {
  const byId = new Map(concepts.map(c => [c.id, c]));
  const childrenMap = new Map<string, GlobalConcept[]>();

  for (const c of concepts) {
    if (c.parent_concept_id && byId.has(c.parent_concept_id)) {
      const arr = childrenMap.get(c.parent_concept_id) ?? [];
      arr.push(c);
      childrenMap.set(c.parent_concept_id, arr);
    }
  }

  // Roots = concepts with no parent or parent not in set
  const roots = concepts.filter(c => !c.parent_concept_id || !byId.has(c.parent_concept_id));

  function buildNode(concept: GlobalConcept, depth: number): TreeNode {
    const kids = childrenMap.get(concept.id) ?? [];
    // Sort children: active first, then by name
    kids.sort((a, b) => {
      if (a.state === 2 && b.state !== 2) return 1;
      if (a.state !== 2 && b.state === 2) return -1;
      return a.name.localeCompare(b.name);
    });
    return {
      concept,
      children: kids.map(k => buildNode(k, depth + 1)),
      depth,
    };
  }

  // Sort roots: active first, then by name
  roots.sort((a, b) => {
    if (a.state === 2 && b.state !== 2) return 1;
    if (a.state !== 2 && b.state === 2) return -1;
    return a.name.localeCompare(b.name);
  });

  return roots.map(r => buildNode(r, 0));
}

/** Single concept node styled like a deck card */
function ConceptCardNode({
  node,
  isLocked,
  lockedIds,
  onStartStudy,
  onEdit,
  onOpenQuestions,
}: {
  node: TreeNode;
  isLocked: boolean;
  lockedIds: Set<string>;
  onStartStudy?: (c: GlobalConcept) => void;
  onEdit?: (c: GlobalConcept) => void;
  onOpenQuestions?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(() => node.depth < 2 && node.concept.state !== 2);
  const c = node.concept;
  const si = stateInfo(c.state);
  const isDominated = c.state === 2;
  const isLearning = c.state === 1 || c.state === 3;
  const totalAttempts = c.correct_count + c.wrong_count;
  const accuracy = totalAttempts > 0 ? Math.round((c.correct_count / totalAttempts) * 100) : 0;
  const hasChildren = node.children.length > 0;
  const canStudy = !isLocked && !isDominated;

  // Border color based on state
  const borderClass = isDominated
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : isLearning
      ? 'border-amber-500/40 bg-amber-500/5'
      : isLocked
        ? 'border-border/30 bg-muted/30'
        : 'border-border/60 bg-card';

  // State icon
  const StateIcon = isDominated
    ? () => <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : isLocked
      ? () => <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
      : isLearning
        ? () => <Loader2 className="h-3.5 w-3.5 text-amber-500" />
        : () => <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;

  return (
    <div className="relative">
      {/* The card node */}
      <div
        className={`relative rounded-xl border-2 p-3 transition-all ${borderClass} ${
          isLocked ? 'opacity-60' : 'hover:shadow-md'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {/* State indicator */}
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isDominated ? 'bg-emerald-500/15' : isLearning ? 'bg-amber-500/15' : isLocked ? 'bg-muted/50' : 'bg-muted/30'
          }`}>
            <StateIcon />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${si.color}`}>
                {si.label}
              </span>
              {c.state !== 0 && !isLocked && (
                <span className="text-[9px] text-muted-foreground">{nextReviewLabel(c.scheduled_date)}</span>
              )}
            </div>
            <p className={`text-sm font-semibold leading-snug ${isLocked ? 'text-muted-foreground/60' : 'text-foreground'}`}>
              {c.name}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
              {c.category && (
                <span className="truncate">{c.category}{c.subcategory ? ` › ${c.subcategory}` : ''}</span>
              )}
              {totalAttempts > 0 && (
                <span className="shrink-0">· {accuracy}% ({totalAttempts})</span>
              )}
            </div>

            {/* Action row */}
            {canStudy && onStartStudy && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-[11px] gap-1"
                onClick={(e) => { e.stopPropagation(); onStartStudy(c); }}
              >
                <Play className="h-3 w-3" /> Estudar
              </Button>
            )}
          </div>

          {/* Expand toggle for children */}
          {hasChildren && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 p-1 rounded-md hover:bg-accent/50 transition-colors"
            >
              {expanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
              <span className="sr-only">{expanded ? 'Recolher' : 'Expandir'}</span>
            </button>
          )}
        </div>

        {/* Children count badge */}
        {hasChildren && !expanded && (
          <div className="mt-2 flex items-center gap-1">
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              +{node.children.length} ramificaç{node.children.length > 1 ? 'ões' : 'ão'}
            </Badge>
          </div>
        )}
      </div>

      {/* Children tree branches */}
      {hasChildren && expanded && (
        <div className="mt-1 ml-4 pl-4 border-l-2 border-dashed border-border/50 space-y-1">
          {node.children.map((child, i) => (
            <div key={child.concept.id} className="relative">
              {/* Horizontal connector line */}
              <div className="absolute -left-4 top-5 w-4 border-t-2 border-dashed border-border/50" />
              <ConceptCardNode
                node={child}
                isLocked={lockedIds.has(child.concept.id)}
                lockedIds={lockedIds}
                onStartStudy={onStartStudy}
                onEdit={onEdit}
                onOpenQuestions={onOpenQuestions}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConceptNeuralMap({
  concepts,
  lockedIds,
  onStartStudy,
  onEdit,
  onOpenQuestions,
}: ConceptNeuralMapProps) {
  const forest = useMemo(() => buildForest(concepts), [concepts]);

  if (concepts.length === 0) return null;

  // Stats
  const totalDominated = concepts.filter(c => c.state === 2).length;
  const totalConcepts = concepts.length;
  const progressPct = totalConcepts > 0 ? Math.round((totalDominated / totalConcepts) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Mapa Neural</h3>
          <p className="text-[11px] text-muted-foreground">
            {totalDominated}/{totalConcepts} conceitos dominados ({progressPct}%)
          </p>
        </div>
      </div>

      {/* Tree */}
      <div className="space-y-2">
        {forest.map(root => (
          <ConceptCardNode
            key={root.concept.id}
            node={root}
            isLocked={lockedIds.has(root.concept.id)}
            lockedIds={lockedIds}
            onStartStudy={onStartStudy}
            onEdit={onEdit}
            onOpenQuestions={onOpenQuestions}
          />
        ))}
      </div>
    </div>
  );
}
