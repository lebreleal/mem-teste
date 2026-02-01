import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { 
  X, 
  Upload, 
  Check, 
  Image as ImageIcon, 
  Loader2,
} from 'lucide-react';
import { resolveImageUrl, isLocalAsset } from '../utils/assetResolver';

interface ImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
  currentImage?: string;
}

interface GalleryImage {
  id: string;
  name: string;
  url: string;
  category: string;
  is_active: boolean;
  order_position: number;
}

export function ImageGalleryModal({ isOpen, onClose, onSelect, currentImage }: ImageGalleryModalProps) {
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(currentImage || null);

  useEffect(() => {
    if (isOpen) {
      fetchGalleryImages();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentImage) {
      setSelectedImage(currentImage);
    }
  }, [currentImage]);

  const fetchGalleryImages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .order('order_position', { ascending: true });

      if (error) throw error;
      setGalleryImages(data as GalleryImage[] || []);
    } catch (error) {
      console.error('Erro ao carregar imagens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get the public URL
      const url = supabase.storage.from('product-images').getPublicUrl(fileName).data.publicUrl;

      // Get max order position
      const maxOrder = galleryImages.length > 0 
        ? Math.max(...galleryImages.map(img => img.order_position)) + 1 
        : 0;

      // Insert into database
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const { data, error: insertError } = await supabase
        .from('gallery_images')
        .insert({
          name: cleanName,
          url,
          category: 'general',
          order_position: maxOrder,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Refresh the list
      await fetchGalleryImages();
      
      // Select the uploaded image
      if (data) {
        setSelectedImage((data as GalleryImage).url);
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da imagem. Tente novamente.');
    } finally {
      setUploading(false);
      // Reset input
      event.target.value = '';
    }
  };

  const handleConfirm = () => {
    if (selectedImage) {
      onSelect(selectedImage);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Selecionar Imagem</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Button */}
        <div className="p-4 border-b border-border">
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 cursor-pointer transition-colors">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? 'Enviando...' : 'Fazer Upload'}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="text-xs text-muted-foreground mt-2">
            Formatos aceitos: JPG, PNG, WEBP. Tamanho máximo: 5MB
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : galleryImages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma imagem na galeria.</p>
              <p className="text-sm">Faça upload de imagens para usar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {galleryImages.map((image) => {
                const resolvedUrl = resolveImageUrl(image.url) || image.url;
                const isSelected = selectedImage === image.url;
                return (
                  <button
                    key={image.id}
                    onClick={() => setSelectedImage(image.url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${
                      isSelected 
                        ? 'border-primary ring-2 ring-primary/30' 
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <img
                      src={resolvedUrl}
                      alt={image.name}
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-xs text-white truncate">{image.name}</p>
                    </div>
                    {isLocalAsset(image.url) && (
                      <div className="absolute top-2 right-2">
                        <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">Local</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {selectedImage ? (
              <span className="text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Imagem selecionada
              </span>
            ) : (
              'Clique em uma imagem para selecioná-la'
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedImage}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
