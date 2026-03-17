/**
 * Card review step: edit, delete, toggle type, and save generated cards.
 * Card list and edit dialog match ManageDeck.tsx for consistency.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CardEditorForm } from '@/components/card-editor/CardEditorForm';
import { ChevronLeft, Check, Pencil, Trash2, Loader2, MessageSquareText, CheckSquare, PenLine } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { GeneratedCard } from './types';

interface CardReviewStepProps {
  cards: GeneratedCard[];
  editingIdx: number | null;
  editFront: string;
  editBack: string;
  onEditFrontChange: (v: string) => void;
  onEditBackChange: (v: string) => void;
  onStartEdit: (i: number) => void;
  onSaveEdit: (extraData?: { mcOptions?: string[]; mcCorrectIndex?: number }) => void;
  onCancelEdit: () => void;
  onDeleteCard: (i: number) => void;
  onToggleType: (i: number) => void;
  onSave: () => void;
  onBack?: (() => void) | undefined;
  isSaving: boolean;
  deckName?: string;
  textSample?: string;
}

const getTypeBadge = (type: string) => {
  if (type === 'cloze') return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary">Cloze</span>;
  return <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border border-border">Básico</span>;
};

const CardReviewStep = ({
  cards, editingIdx, editFront, editBack,
  onEditFrontChange, onEditBackChange, onStartEdit, onSaveEdit, onCancelEdit,
  onDeleteCard, onToggleType, onSave, onBack, isSaving,
}: CardReviewStepProps) => {
  const { toast } = useToast();

  // MC editing state for inline editing
  const [editMcOptions, setEditMcOptions] = useState<string[]>(['', '', '', '']);
  const [editMcCorrectIndex, setEditMcCorrectIndex] = useState(0);

  // Dialog open state
  const [dialogOpen, setDialogOpen] = useState(false);

  // Open dialog when editing starts
  useEffect(() => {
    if (editingIdx !== null) {
      setDialogOpen(true);
    }
  }, [editingIdx]);

  const handleSaveClick = () => {
    onSave();
  };

  const handleSaveEditClick = () => {
    onSaveEdit();
    setDialogOpen(false);
  };

  const handleCancelEdit = () => {
    onCancelEdit();
    setDialogOpen(false);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      handleCancelEdit();
    }
    setDialogOpen(open);
  };

  const renderCardEditor = () => {
    if (editingIdx === null) return null;
    const card = cards[editingIdx];
    if (!card) return null;

    return (
      <CardEditorForm
        front={editFront}
        onFrontChange={onEditFrontChange}
        back={editBack}
        onBackChange={onEditBackChange}
        cardType={card.type === 'cloze' ? 'cloze' : 'basic'}
        hideCloze={card.type !== 'cloze'}
        onSave={handleSaveEditClick}
        onCancel={handleCancelEdit}
        compact
      />
    );
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{cards.length}</span> cartões gerados
        </p>
      </div>

      {/* ── Card list — compact like ManageDeck ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[45dvh] sm:max-h-[50vh]">
        <div className="space-y-3">
          {cards.map((card, idx) => (
            <div key={idx} className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getTypeBadge(card.type)}
                </div>
                <div
                  className="text-sm font-medium text-card-foreground line-clamp-1 prose prose-sm max-w-none [&_img]:max-h-20 [&_img]:rounded"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front) }}
                />
                {card.type === 'cloze' ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(() => {
                      const plain = card.front.replace(/<[^>]*>/g, '');
                      const nums = new Set<number>();
                      let m;
                      const re = /\{\{c(\d+)::/g;
                      while ((m = re.exec(plain)) !== null) nums.add(parseInt(m[1]));
                      return `${nums.size} lacuna${nums.size !== 1 ? 's' : ''}`;
                    })()}
                  </p>
                ) : card.back ? (
                  <div
                    className="mt-1 text-xs text-muted-foreground line-clamp-1 prose prose-xs max-w-none [&_img]:max-h-20 [&_img]:rounded"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back) }}
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStartEdit(idx)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDeleteCard(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Edit Dialog — matches ManageDeck ── */}
      <Dialog open={dialogOpen && editingIdx !== null} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[85dvh] sm:max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Card</DialogTitle>
          </DialogHeader>
          {renderCardEditor()}
        </DialogContent>
      </Dialog>

      <div className="flex gap-2 pt-1">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" /> Reconfigurar
          </Button>
        )}
        <Button
          onClick={handleSaveClick}
          disabled={cards.length === 0 || isSaving}
          className="flex-1 gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar {cards.length} cartões
        </Button>
      </div>
    </div>
  );
};

export default CardReviewStep;
