import { sanitizeHtml } from '@/lib/sanitize';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SuggestCorrectionModal from '@/components/SuggestCorrectionModal';
import type { EditorCardType } from '@/hooks/useManageDeck';

interface ImprovePreviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  improvePreview: { front: string; back: string } | null;
  editorType: EditorCardType | null;
  onApply: () => void;
  onDiscard: () => void;
}

export const ImprovePreviewDialog = ({ open, onOpenChange, improvePreview, editorType, onApply, onDiscard }: ImprovePreviewDialogProps) => {
  if (!improvePreview) return null;

  const renderPreview = () => {
    if (editorType === 'multiple_choice') {
      let mcData: { options: string[]; correctIndex: number } | null = null;
      try { mcData = JSON.parse(improvePreview.back); } catch {}
      return (
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Pergunta melhorada</Label>
            <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.front) }} />
          </div>
          {mcData && (
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Opções melhoradas</Label>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {mcData.options.map((opt, idx) => (
                  <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 ${idx === mcData!.correctIndex ? 'bg-success/10' : ''}`}>
                    <div className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center ${idx === mcData!.correctIndex ? 'border-success bg-success text-white' : 'border-muted-foreground/30'}`}>
                      {idx === mcData!.correctIndex && <span className="text-[10px] font-bold">✓</span>}
                    </div>
                    <span className="text-sm">{opt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{editorType === 'cloze' ? 'Texto melhorado' : 'Frente melhorada'}</Label>
          <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.front) }} />
        </div>
        {editorType !== 'cloze' && (
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Verso melhorado</Label>
            <div className="rounded-lg border border-border bg-muted/30 p-3 prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improvePreview.back) }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Melhoria sugerida
          </DialogTitle>
        </DialogHeader>
        {renderPreview()}
        <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" onClick={onDiscard}>Descartar</Button>
          <Button onClick={onApply} className="gap-2">Aplicar melhoria <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface DeleteCardDialogProps {
  deleteId: string | null;
  setDeleteId: (v: string | null) => void;
  handleDelete: () => void;
}

export const DeleteCardDialog = ({ deleteId, setDeleteId, handleDelete }: DeleteCardDialogProps) => (
  <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="font-display">Excluir card?</AlertDialogTitle>
        <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

interface SuggestCorrectionWrapperProps {
  suggestCard: { id: string; front_content: string; back_content: string; deck_id: string; card_type: string } | null;
  setSuggestCard: (v: any) => void;
}

export const SuggestCorrectionWrapper = ({ suggestCard, setSuggestCard }: SuggestCorrectionWrapperProps) => {
  if (!suggestCard) return null;
  return (
    <SuggestCorrectionModal
      open={!!suggestCard}
      onOpenChange={(open) => { if (!open) setSuggestCard(null); }}
      card={suggestCard}
      deckId={suggestCard.deck_id}
    />
  );
};
