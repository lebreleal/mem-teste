/**
 * AI exam configuration – 3-step wizard matching the deck creation flow.
 * Step 0: Source (Deck selection + Title)
 * Step 1: Question format (total, written vs MC, options count)
 * Step 2: Final adjustments (time, example ref, model, cost)
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Clock, Zap, ChevronLeft, ChevronRight, Check, BookOpen, ListChecks, Settings2 } from 'lucide-react';
import AIModelSelector from '@/components/AIModelSelector';
import ExampleReferenceSection from './ExampleReferenceSection';
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

type SubStep = 0 | 1 | 2;

const SUB_STEP_LABELS = ['Origem', 'Formato', 'Ajustes finais'];
const SUB_STEP_ICONS = [BookOpen, ListChecks, Settings2];
const SUB_STEP_DESCS = [
  'Selecione o baralho de referência para gerar a prova.',
  'Configure a distribuição e o tipo das questões.',
  'Tempo limite, referência de exemplo, modelo e custo.',
];

const AIExamConfig = ({
  userId, selectedDeckId, setSelectedDeckId, title, setTitle,
  totalQuestions, setTotalQuestions, writtenCount, setWrittenCount,
  optionsCount, setOptionsCount, timeLimit, setTimeLimit,
  model, setModel, totalCost, canAfford, activeDecks, onGenerate,
  exampleMode, setExampleMode, exampleText, setExampleText,
  exampleImageUrl, setExampleImageUrl, exampleImageUploading, setExampleImageUploading,
}: AIExamConfigProps) => {
  const [subStep, setSubStep] = useState<SubStep>(0);
  const mcCount = Math.max(0, totalQuestions - writtenCount);

  const canAdvanceStep0 = !!selectedDeckId;

  const handleBack = () => {
    if (subStep > 0) setSubStep((subStep - 1) as SubStep);
  };

  const handleNext = () => {
    if (subStep < 2) setSubStep((subStep + 1) as SubStep);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Prova com IA</h2>
            <p className="text-xs text-muted-foreground">Configure passo a passo</p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center px-1">
          {SUB_STEP_LABELS.map((label, i) => {
            const Icon = SUB_STEP_ICONS[i];
            return (
              <div key={i} className="flex items-center" style={{ flex: i < 2 ? 1 : 'none' }}>
                <button
                  onClick={() => i <= subStep ? setSubStep(i as SubStep) : undefined}
                  className={`flex items-center gap-1.5 ${i <= subStep ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-all ${
                    i <= subStep ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground'
                  }`}>
                    {i < subStep ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className={`text-[11px] font-semibold hidden sm:inline ${i <= subStep ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                </button>
                {i < 2 && <div className={`flex-1 h-0.5 mx-2 rounded-full transition-colors ${i < subStep ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">{SUB_STEP_LABELS[subStep]}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{SUB_STEP_DESCS[subStep]}</p>
        </div>

        {/* Step 0: Source */}
        {subStep === 0 && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Baralho de referência</Label>
              <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
                <SelectContent>{activeDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Título da prova <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input className="mt-1.5" placeholder="Ex: Prova de Anatomia" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 1: Format */}
        {subStep === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Total de questões</Label>
                <Input type="number" min={1} max={50} className="mt-1.5" value={totalQuestions} onChange={e => {
                  const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
                  setTotalQuestions(v);
                  if (writtenCount > v) setWrittenCount(v);
                }} />
              </div>
              <div>
                <Label className="text-sm font-semibold">Dissertativas</Label>
                <Input type="number" min={0} max={totalQuestions} className="mt-1.5" value={writtenCount}
                  onChange={e => setWrittenCount(Math.max(0, Math.min(totalQuestions, parseInt(e.target.value) || 0)))} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Múltipla escolha</span>
                <span className="font-bold text-foreground">{mcCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-muted-foreground">Dissertativas</span>
                <span className="font-bold text-foreground">{writtenCount}</span>
              </div>
            </div>

            {mcCount > 0 && (
              <div>
                <Label className="text-sm font-semibold">Alternativas por questão</Label>
                <div className="flex gap-2 mt-1.5">
                  {([4, 5] as const).map(n => (
                    <button key={n} onClick={() => setOptionsCount(n)} className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                      optionsCount === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}>{n} opções</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Final adjustments */}
        {subStep === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tempo limite (minutos)</Label>
              <Input type="number" min={0} className="mt-1.5" placeholder="0 = sem limite" value={timeLimit || ''}
                onChange={e => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>

            <ExampleReferenceSection
              userId={userId}
              exampleMode={exampleMode} setExampleMode={setExampleMode}
              exampleText={exampleText} setExampleText={setExampleText}
              exampleImageUrl={exampleImageUrl} setExampleImageUrl={setExampleImageUrl}
              exampleImageUploading={exampleImageUploading} setExampleImageUploading={setExampleImageUploading}
            />

            <div>
              <Label className="text-sm font-semibold">Modelo de IA</Label>
              <div className="mt-1.5">
                <AIModelSelector model={model} onChange={setModel} baseCost={totalQuestions * 2} />
              </div>
            </div>

            {/* Cost summary */}
            <div className={`rounded-xl border px-4 py-3 ${canAfford ? 'border-primary/20 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Custo estimado</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${canAfford ? 'text-primary' : 'text-destructive'}`}>{totalCost} Créditos</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{totalQuestions} questões × 2 créditos{model === 'pro' ? ' × 5' : ''} = {totalCost}</p>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                <Zap className="inline h-3.5 w-3.5 text-primary mr-1" />
                Correção de dissertativas: <span className="font-bold text-foreground">gratuita 10x/dia</span>, após 2 Créditos IA.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="flex gap-2">
        {subStep > 0 && (
          <Button variant="outline" onClick={handleBack} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        )}
        {subStep < 2 ? (
          <Button onClick={handleNext} className="flex-1 gap-1.5" disabled={subStep === 0 && !canAdvanceStep0}>
            Continuar <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={onGenerate} disabled={!selectedDeckId || !canAfford} className="flex-1 gap-2 h-12 text-base">
            <Sparkles className="h-5 w-5" /> Gerar Prova com IA
          </Button>
        )}
      </div>
    </div>
  );
};

export default AIExamConfig;
