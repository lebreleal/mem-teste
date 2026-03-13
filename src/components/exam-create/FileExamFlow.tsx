/**
 * File-based exam flow: upload → page selection → shared wizard config.
 */

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  FileUp, Upload, Loader2, CheckCircle2, ChevronRight,
  Sparkles,
} from 'lucide-react';
import ExamConfigWizard from './ExamConfigWizard';
import AISourceSelector from '@/components/AISourceSelector';
import type { PageItem } from './types';
import type { AIModel } from '@/hooks/useAIModel';
import type { AISource } from '@/hooks/useAISources';

interface FileExamFlowProps {
  userId: string;
  fileStep: 'upload' | 'loading' | 'pages' | 'config';
  filePages: PageItem[];
  fileLoadProgress: { current: number; total: number };
  fileLoading: boolean;
  fileName: string;
  fileTitle: string;
  setFileTitle: (v: string) => void;
  fileTotalQuestions: number;
  setFileTotalQuestions: (v: number) => void;
  fileWrittenCount: number;
  setFileWrittenCount: (v: number) => void;
  fileOptionsCount: 4 | 5;
  setFileOptionsCount: (v: 4 | 5) => void;
  fileTimeLimit: number;
  setFileTimeLimit: (v: number) => void;
  model: AIModel;
  setModel: (m: AIModel) => void;
  fileTotalCost: number;
  fileCanAfford: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTogglePage: (idx: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onContinueToConfig: () => void;
  onGenerate: () => void;
  exampleMode: 'none' | 'text' | 'image';
  setExampleMode: (m: 'none' | 'text' | 'image') => void;
  exampleText: string;
  setExampleText: (t: string) => void;
  exampleImageUrl: string;
  setExampleImageUrl: (url: string) => void;
  exampleImageUploading: boolean;
  setExampleImageUploading: (v: boolean) => void;
}

const FileExamFlow = ({
  userId, fileStep, filePages, fileLoadProgress, fileLoading, fileName,
  fileTitle, setFileTitle, fileTotalQuestions, setFileTotalQuestions,
  fileWrittenCount, setFileWrittenCount, fileOptionsCount, setFileOptionsCount,
  fileTimeLimit, setFileTimeLimit, model, setModel, fileTotalCost, fileCanAfford,
  onFileUpload, onTogglePage, onSelectAll, onDeselectAll, onContinueToConfig, onGenerate,
  exampleMode, setExampleMode, exampleText, setExampleText,
  exampleImageUrl, setExampleImageUrl, exampleImageUploading, setExampleImageUploading,
}: FileExamFlowProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFilePages = filePages.filter(p => p.selected);

  return (
    <div className="space-y-5">
      {/* Upload step */}
      {fileStep === 'upload' && (
        <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
              <FileUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Prova a partir de Arquivo</h2>
              <p className="text-xs text-muted-foreground">Envie um PDF, PPTX, DOCX ou TXT</p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.pptx,.docx,.txt" className="hidden" onChange={onFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={fileLoading}
            className="w-full flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 transition-colors hover:bg-muted/50 hover:border-primary/30">
            {fileLoading ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{fileLoading ? 'Processando...' : 'Clique para enviar PDF, PPTX, DOCX ou TXT'}</span>
          </button>
        </div>
      )}

      {/* Loading step */}
      {fileStep === 'loading' && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Processando página {fileLoadProgress.current} de {fileLoadProgress.total}...</p>
          {fileLoadProgress.total > 0 && <Progress value={(fileLoadProgress.current / fileLoadProgress.total) * 100} className="h-2 w-48" />}
        </div>
      )}

      {/* Page selection step */}
      {fileStep === 'pages' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">Selecione as páginas</p>
              <p className="text-[11px] text-muted-foreground">{fileName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={onSelectAll}>Todas</Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={onDeselectAll}>Nenhuma</Button>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filePages.map((page, idx) => (
                <button key={idx} onClick={() => onTogglePage(idx)}
                  className={`relative rounded-xl border-2 overflow-hidden transition-all ${
                    page.selected ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border opacity-60 hover:opacity-80'
                  }`}>
                  {page.thumbnailUrl ? (
                    <img src={page.thumbnailUrl} alt={`Página ${page.pageNumber}`} className="w-full aspect-[4/3] object-cover bg-white" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center p-2">
                      <p className="text-[8px] text-muted-foreground line-clamp-4 text-center leading-tight">{page.textContent.slice(0, 120)}...</p>
                    </div>
                  )}
                  {page.selected && (
                    <div className="absolute top-1.5 right-1.5">
                      <CheckCircle2 className="h-5 w-5 text-primary drop-shadow-md" fill="hsl(var(--background))" />
                    </div>
                  )}
                  <p className="text-center text-[10px] font-medium text-muted-foreground py-1">{page.pageNumber}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{selectedFilePages.length}</span> páginas selecionadas
            </div>
            <Button onClick={onContinueToConfig} disabled={selectedFilePages.length === 0} className="gap-2">
              Continuar <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Config step – reuses shared wizard */}
      {fileStep === 'config' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-foreground">Configurar Prova</h2>
                <p className="text-[11px] text-muted-foreground">{selectedFilePages.length} páginas de "{fileName}"</p>
              </div>
            </div>
          </div>

          {/* Title input before wizard */}
          <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
            <Label className="text-sm font-semibold">Título <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input className="mt-1.5" placeholder="Ex: Prova de Anatomia" value={fileTitle} onChange={e => setFileTitle(e.target.value)} />
          </div>

          <ExamConfigWizard
            userId={userId}
            totalQuestions={fileTotalQuestions} setTotalQuestions={setFileTotalQuestions}
            writtenCount={fileWrittenCount} setWrittenCount={setFileWrittenCount}
            optionsCount={fileOptionsCount} setOptionsCount={setFileOptionsCount}
            timeLimit={fileTimeLimit} setTimeLimit={setFileTimeLimit}
            model={model} setModel={setModel}
            totalCost={fileTotalCost} canAfford={fileCanAfford}
            onGenerate={onGenerate}
            generateDisabled={selectedFilePages.length === 0}
            exampleMode={exampleMode} setExampleMode={setExampleMode}
            exampleText={exampleText} setExampleText={setExampleText}
            exampleImageUrl={exampleImageUrl} setExampleImageUrl={setExampleImageUrl}
            exampleImageUploading={exampleImageUploading} setExampleImageUploading={setExampleImageUploading}
            summaryExtra={`${selectedFilePages.length} páginas`}
          />
        </div>
      )}
    </div>
  );
};

export default FileExamFlow;
