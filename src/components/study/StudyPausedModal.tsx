/**
 * StudyPausedModal — shown when user pauses the study session.
 * Simplified: only shows title + resume/end buttons.
 */

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, X } from 'lucide-react';

interface StudyPausedModalProps {
  open: boolean;
  onResume: () => void;
  onEnd: () => void;
}

const StudyPausedModal = ({ open, onResume, onEnd }: StudyPausedModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onResume(); }}>
      <DialogContent className="max-w-xs text-center" onInteractOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center gap-4 py-4">
          <h2 className="text-lg font-bold text-foreground">Estudo Pausado</h2>
          <div className="flex flex-col gap-2 w-full">
            <Button onClick={onResume} className="w-full rounded-full gap-2">
              <Play className="h-4 w-4 fill-current" />
              Continuar Estudo
            </Button>
            <Button variant="ghost" onClick={onEnd} className="w-full rounded-full gap-2 text-muted-foreground">
              <X className="h-4 w-4" />
              Encerrar Sessão
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudyPausedModal;
