/**
 * Modal shown when the user tries to delete a deck/exam that is shared in a community.
 * Blocks deletion and offers archiving as an alternative.
 */

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Archive, AlertTriangle } from 'lucide-react';

interface CommunityDeleteBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemType: 'deck' | 'exam';
  /** If provided, shows an "Archive" button. Exams may not support archiving. */
  onArchive?: () => void;
}

const CommunityDeleteBlockDialog = ({
  open, onOpenChange, itemName, itemType, onArchive,
}: CommunityDeleteBlockDialogProps) => {
  const typeLabel = itemType === 'deck' ? 'baralho' : 'prova';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <AlertDialogTitle className="font-display">
              Não é possível excluir
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              O {typeLabel} <strong>"{itemName}"</strong> está sendo usado em uma comunidade.
            </span>
            <span className="block">
              Para excluí-lo, primeiro remova-o da comunidade. Membros que já importaram o conteúdo não perderão suas cópias — apenas o vínculo será desfeito.
            </span>
            {onArchive && (
              <span className="block text-foreground font-medium">
                Enquanto isso, você pode arquivá-lo.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Entendi</AlertDialogCancel>
          {onArchive && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                onArchive();
                onOpenChange(false);
              }}
            >
              <Archive className="h-4 w-4" /> Arquivar
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CommunityDeleteBlockDialog;
