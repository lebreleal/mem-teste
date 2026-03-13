import type { GlobalConcept } from '@/services/globalConceptService';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Lock, MoreVertical, Pencil, Link2, Trash2 } from 'lucide-react';
import { stateInfo, nextReviewLabel } from './helpers';

interface ConceptListItemProps {
  concept: GlobalConcept;
  isLocked: boolean;
  isSelected: boolean;
  selectionMode: boolean;
  parentName?: string;
  onToggleSelection: (id: string) => void;
  onEdit: (concept: GlobalConcept) => void;
  onOpenQuestions: (conceptId: string) => void;
  onDelete: (concept: GlobalConcept) => void;
}

const ConceptListItem = ({
  concept, isLocked, isSelected, selectionMode, parentName,
  onToggleSelection, onEdit, onOpenQuestions, onDelete,
}: ConceptListItemProps) => {
  const si = stateInfo(concept.state);
  const totalAttempts = concept.correct_count + concept.wrong_count;
  const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`group rounded-xl border bg-card p-4 transition-colors cursor-pointer relative ${
              isLocked
                ? 'opacity-50 border-border/30'
                : isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/60 hover:border-border hover:shadow-sm'
            }`}
            onClick={() => { if (selectionMode) onToggleSelection(concept.id); }}
          >
            <div className="flex items-start gap-3">
              {selectionMode && (
                <div className="pt-0.5 shrink-0" onClick={e => { e.stopPropagation(); onToggleSelection(concept.id); }}>
                  <Checkbox checked={isSelected} />
                </div>
              )}
              {isLocked && !selectionMode && (
                <Lock className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${si.color}`}>
                    {si.label}
                  </span>
                  {concept.state !== 0 && !isLocked && (
                    <span className="text-[10px] text-muted-foreground">{nextReviewLabel(concept.scheduled_date)}</span>
                  )}
                  {isLocked && (
                    <span className="text-[10px] text-muted-foreground italic">Bloqueado</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground leading-snug">{concept.name}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  {concept.category ? (
                    <span>{concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}</span>
                  ) : (
                    <span className="italic">Sem categoria</span>
                  )}
                  {totalAttempts > 0 && (
                    <>
                      <span>·</span>
                      <span>{accuracy}% acerto ({concept.correct_count}/{totalAttempts})</span>
                    </>
                  )}
                </div>
              </div>

              {!selectionMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onEdit(concept)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onOpenQuestions(concept.id)}>
                      <Link2 className="h-3.5 w-3.5 mr-2" /> Questões vinculadas
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(concept)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </TooltipTrigger>
        {isLocked && parentName && (
          <TooltipContent side="top">
            <p className="text-xs">Domine "{parentName}" primeiro</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

export default ConceptListItem;
