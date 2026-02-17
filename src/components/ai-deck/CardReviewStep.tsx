/**
 * Card review step: edit, delete, toggle type, and save generated cards.
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, Check, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { GeneratedCard } from './types';

interface CardReviewStepProps {
  cards: GeneratedCard[];
  editingIdx: number | null;
  editFront: string;
  editBack: string;
  onEditFrontChange: (v: string) => void;
  onEditBackChange: (v: string) => void;
  onStartEdit: (i: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteCard: (i: number) => void;
  onToggleType: (i: number) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
}

const CardReviewStep = ({
  cards, editingIdx, editFront, editBack,
  onEditFrontChange, onEditBackChange, onStartEdit, onSaveEdit, onCancelEdit,
  onDeleteCard, onToggleType, onSave, onBack, isSaving,
}: CardReviewStepProps) => (
  <div className="flex flex-col gap-3 flex-1 min-h-0">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-bold text-foreground">{cards.length}</span> cartões gerados
      </p>
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[60dvh] sm:max-h-[65vh]">
      <div className="space-y-2">
        {cards.map((card, idx) => (
          <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-2">
            {editingIdx === idx ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Frente</Label>
                  <Textarea value={editFront} onChange={e => onEditFrontChange(e.target.value)} rows={2} className="resize-none text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Verso</Label>
                  <Textarea value={editBack} onChange={e => onEditBackChange(e.target.value)} rows={2} className="resize-none text-sm" />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancelar</Button>
                  <Button size="sm" onClick={onSaveEdit} className="gap-1"><Check className="h-3 w-3" /> Salvar</Button>
                </div>
              </>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground leading-snug">{card.front}</p>
                  {card.type === 'multiple_choice' && card.options ? (
                    <div className="mt-1 space-y-0.5">
                      {card.options.map((opt, oi) => (
                        <p key={oi} className={`text-[10px] leading-snug ${oi === card.correctIndex ? 'text-success font-bold' : 'text-muted-foreground'}`}>
                          {oi === card.correctIndex ? '✓ ' : '  '}{opt}
                        </p>
                      ))}
                    </div>
                  ) : card.back ? (
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">{card.back}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onToggleType(idx)}
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border transition-colors ${
                      card.type === 'cloze' ? 'border-primary/40 bg-primary/10 text-primary'
                      : card.type === 'multiple_choice' ? 'border-warning/40 bg-warning/10 text-warning'
                      : 'border-border hover:bg-muted'
                    }`}>
                    {card.type === 'cloze' ? 'Cloze' : card.type === 'multiple_choice' ? 'Múltipla' : 'Básico'}
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onStartEdit(idx)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteCard(idx)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>

    <div className="flex gap-2 pt-2">
      <Button variant="outline" onClick={onBack} className="gap-1.5">
        <ChevronLeft className="h-3.5 w-3.5" /> Reconfigurar
      </Button>
      <Button onClick={onSave} disabled={cards.length === 0 || isSaving} className="flex-1 gap-2">
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Salvar {cards.length} cartões
      </Button>
    </div>
  </div>
);

export default CardReviewStep;
