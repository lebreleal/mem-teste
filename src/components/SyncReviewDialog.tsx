/**
 * SyncReviewDialog – shows added/removed/modified questions for selective sync.
 */

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Pencil, Loader2 } from 'lucide-react';

export interface SyncChange {
  type: 'added' | 'removed' | 'modified';
  questionText: string;
  /** For modified: the new version text */
  newText?: string;
  /** source question data to insert/update */
  sourceData?: any;
  /** local question id (for removed/modified) */
  localId?: string;
}

interface SyncReviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  changes: SyncChange[];
  onApply: (selectedChanges: SyncChange[]) => Promise<void>;
  title?: string;
}

const SyncReviewDialog = ({ open, onOpenChange, changes, onApply, title }: SyncReviewDialogProps) => {
  const [selected, setSelected] = useState<Set<number>>(new Set(changes.map((_, i) => i)));
  const [applying, setApplying] = useState(false);

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(changes.map((_, i) => i)));

  const handleApply = async () => {
    setApplying(true);
    try {
      const toApply = changes.filter((_, i) => selected.has(i));
      await onApply(toApply);
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  const added = changes.filter(c => c.type === 'added');
  const removed = changes.filter(c => c.type === 'removed');
  const modified = changes.filter(c => c.type === 'modified');

  const getIcon = (type: SyncChange['type']) => {
    switch (type) {
      case 'added': return <Plus className="h-3.5 w-3.5 text-primary shrink-0" />;
      case 'removed': return <Minus className="h-3.5 w-3.5 text-destructive shrink-0" />;
      case 'modified': return <Pencil className="h-3.5 w-3.5 text-accent-foreground shrink-0" />;
    }
  };

  const getBadge = (type: SyncChange['type']) => {
    switch (type) {
      case 'added': return <Badge variant="outline" className="text-primary border-primary/30 text-[10px]">Nova</Badge>;
      case 'removed': return <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">Removida</Badge>;
      case 'modified': return <Badge variant="outline" className="text-accent-foreground border-accent text-[10px]">Editada</Badge>;
    }
  };

  if (changes.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">Revisão de Alterações</DialogTitle>
          <DialogDescription>
            {title && <span className="font-medium">{title} — </span>}
            {added.length > 0 && <span className="text-green-600">{added.length} nova{added.length !== 1 ? 's' : ''}</span>}
            {added.length > 0 && (removed.length > 0 || modified.length > 0) && ' · '}
            {removed.length > 0 && <span className="text-destructive">{removed.length} removida{removed.length !== 1 ? 's' : ''}</span>}
            {removed.length > 0 && modified.length > 0 && ' · '}
            {modified.length > 0 && <span className="text-amber-600">{modified.length} editada{modified.length !== 1 ? 's' : ''}</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh] pr-2">
          <div className="space-y-1">
            {changes.map((change, idx) => (
              <label
                key={idx}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selected.has(idx)}
                  onCheckedChange={() => toggle(idx)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {getIcon(change.type)}
                    {getBadge(change.type)}
                  </div>
                  <p className="text-sm text-foreground line-clamp-2">{change.questionText}</p>
                  {change.type === 'modified' && change.newText && (
                    <p className="text-xs text-muted-foreground line-clamp-2">→ {change.newText}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll} disabled={applying}>
            Selecionar todas
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleApply} disabled={applying || selected.size === 0}>
            {applying ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Aplicando...</> : `Aplicar (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncReviewDialog;
