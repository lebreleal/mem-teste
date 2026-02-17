/**
 * Upload step: choose between text input or file upload.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Upload, ChevronLeft } from 'lucide-react';
import { ACCEPTED_FILE_TYPES } from '@/types/ai';
import type { RefObject } from 'react';

interface UploadStepProps {
  deckName: string;
  onDeckNameChange: (v: string) => void;
  inputMode: 'text' | 'file' | null;
  onInputModeChange: (v: 'text' | 'file' | null) => void;
  rawText: string;
  onRawTextChange: (v: string) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextContinue: () => void;
}

const UploadStep = ({
  deckName, onDeckNameChange, inputMode, onInputModeChange,
  rawText, onRawTextChange, fileInputRef, onFileSelect, onTextContinue,
}: UploadStepProps) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <Label>Nome da coleção</Label>
      <Input value={deckName} onChange={e => onDeckNameChange(e.target.value)} placeholder="Ex: Calcificações Patológicas 2026" maxLength={100} />
    </div>

    {!inputMode && (
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onInputModeChange('text')} className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-5 transition-colors hover:border-primary hover:bg-primary/5">
          <FileText className="h-7 w-7 text-primary" />
          <span className="text-sm font-semibold text-foreground">Colar texto</span>
          <span className="text-[10px] text-muted-foreground">Cole o conteúdo diretamente</span>
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-5 transition-colors hover:border-primary hover:bg-primary/5">
          <Upload className="h-7 w-7 text-primary" />
          <span className="text-sm font-semibold text-foreground">Enviar arquivo</span>
          <span className="text-[10px] text-muted-foreground">PDF, PPTX, DOCX, TXT</span>
        </button>
      </div>
    )}

    {inputMode === 'text' && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Conteúdo</Label>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onInputModeChange(null)}>Voltar</Button>
        </div>
        <Textarea value={rawText} onChange={e => onRawTextChange(e.target.value)} placeholder="Cole aqui o texto..." rows={6} maxLength={30000} className="resize-none" />
        <p className="text-[10px] text-muted-foreground text-right">{rawText.length.toLocaleString()}/30.000</p>
        <Button onClick={onTextContinue} disabled={!deckName.trim() || !rawText.trim()} className="w-full gap-2">
          Continuar <ChevronLeft className="h-4 w-4 rotate-180" />
        </Button>
      </div>
    )}

    <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={onFileSelect} className="hidden" />
  </div>
);

export default UploadStep;
