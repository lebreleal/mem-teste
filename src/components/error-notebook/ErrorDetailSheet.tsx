import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Undo2, Trash2, PlayCircle, FolderOpen } from 'lucide-react';
import type { ErrorDeckCard } from '@/services/errorDeckService';
import { useNavigate } from 'react-router-dom';

const STATE_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'Novo', className: 'bg-muted text-muted-foreground' },
  1: { label: 'Aprendendo', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  2: { label: 'Dominado', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  3: { label: 'Reaprendendo', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

interface Props {
  card: ErrorDeckCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorDeckId: string | null;
  onReturn: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

const ErrorDetailSheet = ({ card, open, onOpenChange, errorDeckId, onReturn, onDelete }: Props) => {
  const navigate = useNavigate();
  if (!card) return null;

  const stateInfo = STATE_LABELS[card.state] ?? STATE_LABELS[0];
  // Strip HTML for preview
  const frontText = card.front_content.replace(/<[^>]+>/g, '').slice(0, 200);
  const backText = card.back_content.replace(/<[^>]+>/g, '').slice(0, 200);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-base">Detalhes do Card</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* State badge */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={stateInfo.className}>{stateInfo.label}</Badge>
            {card.origin_deck_name && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <FolderOpen className="h-2.5 w-2.5" />
                {card.origin_deck_name}
              </Badge>
            )}
          </div>

          {/* Front */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Frente</p>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">{frontText || '(vazio)'}</div>
          </div>

          {/* Back */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Verso</p>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">{backText || '(vazio)'}</div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {errorDeckId && (
              <Button
                className="w-full gap-2"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/study/${errorDeckId}`);
                }}
              >
                <PlayCircle className="h-4 w-4" />
                Estudar Caderno de Erros
              </Button>
            )}

            {card.origin_deck_id && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  onReturn(card.id);
                  onOpenChange(false);
                }}
              >
                <Undo2 className="h-4 w-4" />
                Devolver ao deck original
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full gap-2 text-destructive hover:text-destructive"
              onClick={() => {
                onDelete(card.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Excluir card
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ErrorDetailSheet;
