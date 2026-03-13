/**
 * ConceptGroupedList — Organizes concepts into clear priority sections.
 * Sections: Due → Frontier → Learning → Mastered (collapsed) → Locked (collapsed)
 */
import { useState, useMemo } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import ConceptListItem from './ConceptListItem';
import {
  Clock, Unlock, BrainCircuit, Shield, Lock,
  ChevronDown, ChevronRight, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ConceptGroupedListProps {
  concepts: GlobalConcept[];
  lockedIds: Set<string>;
  allConcepts: GlobalConcept[];
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onEdit: (concept: GlobalConcept) => void;
  onOpenQuestions: (conceptId: string) => void;
  onDelete: (concept: GlobalConcept) => void;
  onStartStudy: (concept: GlobalConcept) => void;
}

interface SectionConfig {
  key: string;
  label: string;
  icon: typeof Clock;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  defaultCollapsed: boolean;
  showStudyAll?: boolean;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'due',
    label: 'Para revisar agora',
    icon: Clock,
    iconColor: 'text-primary',
    bgColor: 'bg-primary/5',
    borderColor: 'border-primary/20',
    defaultCollapsed: false,
    showStudyAll: true,
  },
  {
    key: 'frontier',
    label: 'Fronteira de aprendizagem',
    icon: Unlock,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/5',
    borderColor: 'border-emerald-500/20',
    defaultCollapsed: false,
    showStudyAll: true,
  },
  {
    key: 'learning',
    label: 'Aprendendo',
    icon: BrainCircuit,
    iconColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/5',
    borderColor: 'border-amber-500/20',
    defaultCollapsed: false,
  },
  {
    key: 'mastered',
    label: 'Dominados',
    icon: Shield,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-muted/30',
    borderColor: 'border-border/40',
    defaultCollapsed: true,
  },
  {
    key: 'locked',
    label: 'Bloqueados',
    icon: Lock,
    iconColor: 'text-muted-foreground',
    bgColor: 'bg-muted/20',
    borderColor: 'border-border/30',
    defaultCollapsed: true,
  },
];

const ConceptGroupedList = ({
  concepts, lockedIds, allConcepts, selectionMode, selectedIds,
  onToggleSelection, onEdit, onOpenQuestions, onDelete, onStartStudy,
}: ConceptGroupedListProps) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map(s => [s.key, s.defaultCollapsed]))
  );

  const now = useMemo(() => new Date(), []);
  const byId = useMemo(() => new Map(allConcepts.map(c => [c.id, c])), [allConcepts]);

  const groups = useMemo(() => {
    const due: GlobalConcept[] = [];
    const frontier: GlobalConcept[] = [];
    const learning: GlobalConcept[] = [];
    const mastered: GlobalConcept[] = [];
    const locked: GlobalConcept[] = [];

    for (const c of concepts) {
      const isLocked = lockedIds.has(c.id);

      if (isLocked) {
        locked.push(c);
        continue;
      }

      // Mastered (state 2)
      if (c.state === 2) {
        // Due mastered go to "due" section
        if (new Date(c.scheduled_date) <= now) {
          due.push(c);
        } else {
          mastered.push(c);
        }
        continue;
      }

      // Due for review (state 1/3 or state 0 with scheduled_date <= now)
      if (new Date(c.scheduled_date) <= now && c.state !== 0) {
        due.push(c);
        continue;
      }

      // Frontier: new (state 0), unlocked (parent mastered or no parent)
      if (c.state === 0) {
        frontier.push(c);
        continue;
      }

      // Learning (state 1/3, not due)
      learning.push(c);
    }

    return { due, frontier, learning, mastered, locked };
  }, [concepts, lockedIds, now]);

  const groupMap: Record<string, GlobalConcept[]> = groups;

  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <h3 className="font-display text-lg font-semibold text-foreground">Nenhum tema encontrado</h3>
        <p className="mt-1 text-sm text-muted-foreground">Tente ajustar os filtros.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {SECTIONS.map(section => {
        const items = groupMap[section.key] ?? [];
        if (items.length === 0) return null;

        const isCollapsed = collapsed[section.key];
        const Icon = section.icon;
        const Chevron = isCollapsed ? ChevronRight : ChevronDown;

        return (
          <div key={section.key} className={`rounded-xl border ${section.borderColor} ${section.bgColor} overflow-hidden`}>
            {/* Section header */}
            <button
              onClick={() => toggle(section.key)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
            >
              <Chevron className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Icon className={`h-4 w-4 shrink-0 ${section.iconColor}`} />
              <span className="text-xs font-semibold text-foreground flex-1">{section.label}</span>
              <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{items.length}</Badge>
              {section.showStudyAll && items.length > 0 && !selectionMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary"
                  onClick={e => {
                    e.stopPropagation();
                    if (items.length > 0) onStartStudy(items[0]);
                  }}
                >
                  <Play className="h-2.5 w-2.5" />
                  Estudar
                </Button>
              )}
            </button>

            {/* Section content */}
            {!isCollapsed && (
              <div className="px-2 pb-2 space-y-1.5">
                {items.map(concept => {
                  const isLocked = lockedIds.has(concept.id);
                  const parentConcept = isLocked && concept.parent_concept_id
                    ? byId.get(concept.parent_concept_id)
                    : null;

                  return (
                    <ConceptListItem
                      key={concept.id}
                      concept={concept}
                      isLocked={isLocked}
                      isSelected={selectedIds.has(concept.id)}
                      selectionMode={selectionMode}
                      parentName={parentConcept?.name}
                      onToggleSelection={onToggleSelection}
                      onEdit={onEdit}
                      onOpenQuestions={onOpenQuestions}
                      onDelete={onDelete}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ConceptGroupedList;
