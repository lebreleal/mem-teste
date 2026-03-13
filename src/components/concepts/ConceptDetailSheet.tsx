/**
 * ConceptDetailSheet — Bottom sheet shown when tapping a concept node.
 * Shows concept info, study button, linked questions, edit/delete actions.
 */
import { useState, useEffect } from 'react';
import type { GlobalConcept } from '@/services/globalConceptService';
import { getConceptQuestions } from '@/services/globalConceptService';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, Pencil, Trash2, Link2, Lock } from 'lucide-react';
import { stateInfo, nextReviewLabel } from './helpers';

interface ConceptDetailSheetProps {
  concept: GlobalConcept | null;
  isLocked: boolean;
  onClose: () => void;
  onStudy: (concept: GlobalConcept) => void;
  onEdit: (concept: GlobalConcept) => void;
  onDelete: (concept: GlobalConcept) => void;
  onOpenQuestions: (conceptId: string) => void;
}

export default function ConceptDetailSheet({
  concept,
  isLocked,
  onClose,
  onStudy,
  onEdit,
  onDelete,
  onOpenQuestions,
}: ConceptDetailSheetProps) {
  const [questions, setQuestions] = useState<{ id: string; questionText: string; deckId: string; deckName?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!concept) { setQuestions([]); return; }
    setLoading(true);
    getConceptQuestions(concept.id)
      .then(setQuestions)
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [concept?.id]);

  if (!concept) return null;

  const si = stateInfo(concept.state);
  const totalAttempts = concept.correct_count + concept.wrong_count;
  const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;
  const isDominated = concept.state === 2;
  const canStudy = !isLocked && !isDominated;

  return (
    <Sheet open={!!concept} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-left text-base">{concept.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Status & stats */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${si.color}`}>
              {si.label}
            </span>
            {concept.state !== 0 && !isLocked && (
              <Badge variant="outline" className="text-[10px]">{nextReviewLabel(concept.scheduled_date)}</Badge>
            )}
            {isLocked && (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                <Lock className="h-3 w-3" /> Bloqueado
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {concept.category && (
              <span>{concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}</span>
            )}
            {totalAttempts > 0 && (
              <span>{accuracy}% acerto · {totalAttempts} tentativas</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canStudy && (
              <Button className="gap-1.5" onClick={() => { onClose(); onStudy(concept); }}>
                <Play className="h-4 w-4" /> Estudar agora
              </Button>
            )}
            {isDominated && (
              <Button variant="outline" className="gap-1.5" onClick={() => { onClose(); onStudy(concept); }}>
                <Play className="h-4 w-4" /> Revisar
              </Button>
            )}
            <Button variant="outline" className="gap-1.5" onClick={() => { onClose(); onEdit(concept); }}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => { onClose(); onOpenQuestions(concept.id); }}>
              <Link2 className="h-4 w-4" /> Questões
            </Button>
            <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => { onClose(); onDelete(concept); }}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>

          {/* Linked questions preview */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2">Questões vinculadas ({loading ? '...' : questions.length})</h4>
            <ScrollArea className="max-h-[30vh]">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : questions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma questão vinculada.</p>
              ) : (
                <div className="space-y-1.5">
                  {questions.slice(0, 10).map(q => (
                    <div key={q.id} className="rounded-lg border border-border/50 bg-muted/30 p-2.5">
                      <p className="text-xs text-foreground line-clamp-2">{q.questionText}</p>
                      {q.deckName && <p className="text-[10px] text-muted-foreground mt-0.5">{q.deckName}</p>}
                    </div>
                  ))}
                  {questions.length > 10 && (
                    <p className="text-[10px] text-muted-foreground text-center py-1">
                      +{questions.length - 10} mais questões
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
