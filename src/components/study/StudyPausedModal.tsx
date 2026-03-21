/**
 * StudyPausedModal — shown when user pauses the study session.
 */

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, X } from 'lucide-react';

interface StudyPausedModalProps {
  open: boolean;
  onResume: () => void;
  onEnd: () => void;
  reviewCount: number;
  elapsedMs: number;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const StudyPausedModal = ({ open, onResume, onEnd, reviewCount, elapsedMs }: StudyPausedModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onResume(); }}>
      <DialogContent className="max-w-xs text-center" onInteractOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Play className="h-8 w-8 text-primary ml-1" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Estudo Pausado</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {reviewCount} cartões revisados · {formatTime(elapsedMs)}
            </p>
          </div>
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
