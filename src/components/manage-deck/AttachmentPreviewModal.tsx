import { ScanEye, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
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
                <ScanEye className="h-4 w-4" />
                Adicionar oclusão de imagem
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AttachmentPreviewModal;
