import { X } from 'lucide-react';
import { IconImageOcclusion } from '@/components/icons';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface AttachmentPreviewModalProps {
  open: boolean;
  imageUrl: string | null;
  canConvertToOcclusion?: boolean;
  onClose: () => void;
  onAddOcclusion?: () => void;
}

const AttachmentPreviewModal = ({
  open,
  imageUrl,
  canConvertToOcclusion = false,
  onClose,
  onAddOcclusion,
}: AttachmentPreviewModalProps) => {
  if (!open || !imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background p-0 shadow-2xl sm:rounded-3xl [&>button]:hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Fechar pré-visualização"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4 p-4 pt-12">
          <div className="flex min-h-[18rem] items-center justify-center rounded-2xl bg-muted/20 p-4">
            <img
              src={imageUrl}
              alt="Pré-visualização do anexo"
              className="max-h-[55dvh] w-auto max-w-full rounded-xl object-contain"
            />
          </div>

          {canConvertToOcclusion && onAddOcclusion ? (
            <div className="flex justify-center">
              <Button type="button" className="gap-2 rounded-full px-5" onClick={onAddOcclusion}>
                <IconImageOcclusion className="h-4 w-4" />
                Adicionar oclusão de imagem
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AttachmentPreviewModal;
