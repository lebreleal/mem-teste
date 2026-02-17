/**
 * Example reference section (text or image) shared by AI and File exam modes.
 */

import { useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Image, Type } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ExampleReferenceSectionProps {
  userId: string;
  exampleMode: 'none' | 'text' | 'image';
  setExampleMode: (m: 'none' | 'text' | 'image') => void;
  exampleText: string;
  setExampleText: (t: string) => void;
  exampleImageUrl: string;
  setExampleImageUrl: (url: string) => void;
  exampleImageUploading: boolean;
  setExampleImageUploading: (v: boolean) => void;
}

const ExampleReferenceSection = ({
  userId, exampleMode, setExampleMode, exampleText, setExampleText,
  exampleImageUrl, setExampleImageUrl, exampleImageUploading, setExampleImageUploading,
}: ExampleReferenceSectionProps) => {
  const { toast } = useToast();
  const exampleImageRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    setExampleImageUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `exam-examples/${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('card-images').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
      setExampleImageUrl(urlData.publicUrl);
      setExampleMode('image');
    } catch (err: any) {
      toast({ title: 'Erro ao enviar imagem', description: err.message, variant: 'destructive' });
    } finally {
      setExampleImageUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Envie apenas imagens', variant: 'destructive' });
      return;
    }
    await uploadImage(file);
    if (exampleImageRef.current) exampleImageRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await uploadImage(file);
        return;
      }
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Exemplo de referência (opcional)</Label>
      <p className="text-[11px] text-muted-foreground -mt-1">Forneça um exemplo de enunciado e resposta para a IA se basear no estilo.</p>
      <div className="flex gap-2">
        {([
          { mode: 'none' as const, label: 'Nenhum', icon: null },
          { mode: 'text' as const, label: 'Texto', icon: Type },
          { mode: 'image' as const, label: 'Imagem', icon: Image },
        ]).map(({ mode: m, label, icon: Icon }) => (
          <button
            key={m}
            onClick={() => setExampleMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border-2 py-2 text-xs font-bold transition-all ${
              exampleMode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>
      {exampleMode === 'text' && (
        <Textarea
          placeholder="Cole aqui um exemplo de enunciado e resposta para a IA usar como referência de estilo..."
          value={exampleText}
          onChange={e => setExampleText(e.target.value)}
          className="min-h-[100px] text-sm"
        />
      )}
      {exampleMode === 'image' && (
        <div className="space-y-2" onPaste={handlePaste}>
          <input ref={exampleImageRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {exampleImageUrl ? (
            <div className="relative">
              <img src={exampleImageUrl} alt="Exemplo" className="w-full rounded-xl border border-border object-contain max-h-48" />
              <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={() => { setExampleImageUrl(''); setExampleMode('none'); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => exampleImageRef.current?.click()}
              disabled={exampleImageUploading}
              className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 transition-colors hover:bg-muted/50 hover:border-primary/30"
            >
              {exampleImageUploading ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : <Image className="h-6 w-6 text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">{exampleImageUploading ? 'Enviando...' : 'Envie ou cole (Ctrl+V) um print'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ExampleReferenceSection;
