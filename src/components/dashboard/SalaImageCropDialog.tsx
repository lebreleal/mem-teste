/**
 * SalaImageCropDialog — Image picker + crop/adjust before saving.
 * Uses react-easy-crop for Instagram-style cropping.
 */

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { IconImage, IconUpload } from '@/components/icons';

interface SalaImageCropDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (file: File) => void;
}

/** Crop the image using a canvas and return a File. */
async function getCroppedImg(imageSrc: string, cropArea: Area): Promise<File> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(
    image,
    cropArea.x, cropArea.y, cropArea.width, cropArea.height,
    0, 0, cropArea.width, cropArea.height,
  );

  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob!], 'sala-cover.webp', { type: 'image/webp' }));
    }, 'image/webp', 0.85);
  });
}

const SalaImageCropDialog = ({ open, onOpenChange, onSave }: SalaImageCropDialogProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
      onSave(croppedFile);
      // Reset state
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Mudar imagem da sala</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {!imageSrc ? (
            /* File picker */
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-muted/30 transition-colors">
              <IconUpload className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Toque para selecionar uma imagem</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          ) : (
            /* Cropper */
            <>
              <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-muted">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={16 / 9}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  showGrid={false}
                  style={{
                    containerStyle: { borderRadius: '0.75rem' },
                  }}
                />
              </div>

              {/* Zoom slider */}
              <div className="flex items-center gap-3 px-1">
                <IconImage className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.05}
                  onValueChange={(v) => setZoom(v[0])}
                  className="flex-1"
                />
                <IconImage className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setImageSrc(null)}
                >
                  Trocar
                </Button>
                <Button
                  className="flex-1"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SalaImageCropDialog;
