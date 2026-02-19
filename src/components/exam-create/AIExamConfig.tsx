/**
 * AI exam configuration (deck-based) – uses shared ExamConfigWizard.
 * First shows source selection (deck + title), then wizard steps.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, BookOpen, ChevronRight } from 'lucide-react';
import ExamConfigWizard from './ExamConfigWizard';
import type { AIModel } from '@/hooks/useAIModel';

interface AIExamConfigProps {
  userId: string;
  selectedDeckId: string;
  setSelectedDeckId: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  totalQuestions: number;
  setTotalQuestions: (v: number) => void;
  writtenCount: number;
  setWrittenCount: (v: number) => void;
  optionsCount: 4 | 5;
  setOptionsCount: (v: 4 | 5) => void;
  timeLimit: number;
  setTimeLimit: (v: number) => void;
  model: AIModel;
  setModel: (m: AIModel) => void;
  totalCost: number;
  canAfford: boolean;
  activeDecks: { id: string; name: string }[];
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

const AIExamConfig = (props: AIExamConfigProps) => {
  const [showWizard, setShowWizard] = useState(false);

  if (!showWizard) {
    // Step 0: Source selection
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Origem da prova</h2>
              <p className="text-xs text-muted-foreground">Selecione o baralho de referência</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Baralho de referência</Label>
              <Select value={props.selectedDeckId} onValueChange={props.setSelectedDeckId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
                <SelectContent>{props.activeDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Título da prova <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input className="mt-1.5" placeholder="Ex: Prova de Anatomia" value={props.title} onChange={e => props.setTitle(e.target.value)} />
            </div>
          </div>
        </div>

        <Button onClick={() => setShowWizard(true)} disabled={!props.selectedDeckId} className="w-full gap-1.5 h-11">
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-foreground">Configurar Prova IA</h2>
            <p className="text-[11px] text-muted-foreground">
              {props.activeDecks.find(d => d.id === props.selectedDeckId)?.name}
            </p>
          </div>
        </div>
      </div>

      <ExamConfigWizard
        userId={props.userId}
        totalQuestions={props.totalQuestions} setTotalQuestions={props.setTotalQuestions}
        writtenCount={props.writtenCount} setWrittenCount={props.setWrittenCount}
        optionsCount={props.optionsCount} setOptionsCount={props.setOptionsCount}
        timeLimit={props.timeLimit} setTimeLimit={props.setTimeLimit}
        model={props.model} setModel={props.setModel}
        totalCost={props.totalCost} canAfford={props.canAfford}
        onGenerate={props.onGenerate}
        generateDisabled={!props.selectedDeckId}
        exampleMode={props.exampleMode} setExampleMode={props.setExampleMode}
        exampleText={props.exampleText} setExampleText={props.setExampleText}
        exampleImageUrl={props.exampleImageUrl} setExampleImageUrl={props.setExampleImageUrl}
        exampleImageUploading={props.exampleImageUploading} setExampleImageUploading={props.setExampleImageUploading}
        onBackFromStart={() => setShowWizard(false)}
        summaryExtra={props.activeDecks.find(d => d.id === props.selectedDeckId)?.name}
      />
    </div>
  );
};

export default AIExamConfig;
