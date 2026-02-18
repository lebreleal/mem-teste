import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles } from 'lucide-react';

interface ProModelConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  baseCost?: number;
}

const ProModelConfirmDialog = ({ open, onConfirm, onCancel, baseCost }: ProModelConfirmDialogProps) => {
  const flashCost = baseCost ?? 2;
  const proCost = flashCost * 5;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: 'hsl(var(--energy-purple))' }} />
            Mudar para Raciocínio Pro?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-2">
            <p>
              O modelo <strong>Pro</strong> usa raciocínio avançado e consome{' '}
              <strong className="text-foreground">{proCost} créditos</strong> por uso
              (vs. {flashCost} no Flash).
            </p>
            <p>Deseja continuar com o modelo Pro?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Usar Pro
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ProModelConfirmDialog;
