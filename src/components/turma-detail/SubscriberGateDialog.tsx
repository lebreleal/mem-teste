import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Layers, Play } from 'lucide-react';

interface SubscriberGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckName: string;
  cardCount: number;
  onTrial: () => void;
  onSubscribe: () => void;
}

const SubscriberGateDialog = ({ open, onOpenChange, deckName, cardCount, onTrial, onSubscribe }: SubscriberGateDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5" style={{ color: 'hsl(270, 70%, 55%)' }} />
          Conteúdo Exclusivo
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="rounded-xl bg-muted/50 p-4 space-y-1">
          <p className="text-sm font-semibold text-foreground truncate">{deckName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Layers className="h-3 w-3" /> {cardCount} cards
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Este baralho é exclusivo para assinantes. Você pode experimentar uma sessão de teste ou assinar para ter acesso completo.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full gap-2" onClick={onTrial}>
            <Play className="h-4 w-4" /> Experimentar (Modo Teste)
          </Button>
          <Button className="w-full gap-2" onClick={onSubscribe} style={{ backgroundColor: 'hsl(270, 70%, 55%)' }}>
            <Crown className="h-4 w-4" /> Assinar
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export default SubscriberGateDialog;
