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
  const flashCost = baseCost ?? 0;
  const proCost = flashCost * 10;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Mudar para Raciocínio Pro?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-2">
            <p>
              O modelo <strong>Pro</strong> usa raciocínio avançado e consome bem mais créditos
              por token gerado{flashCost > 0 ? ` (estimativa ≈ ${proCost} créditos, vs. ≈ ${flashCost} no Flash)` : ''}.
              A cobrança final é sempre feita pelo uso real de tokens.
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
