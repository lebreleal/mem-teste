/**
 * Shared 3-step exam config wizard used by both AI+Deck and AI+File modes.
 * Step 1: Formato – total questions, written/MC split, options per MC (4 ABCD / 5 ABCDE)
 * Step 2: Ajustes – time limit, example reference, model
 * Step 3: Resumo – cost summary + generate button
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sparkles, Clock, Zap, ChevronLeft, ChevronRight, Check,
  ListChecks, Settings2, Play, PenLine, CircleDot, Minus, Plus,
} from 'lucide-react';
import AIModelSelector from '@/components/AIModelSelector';
import ExampleReferenceSection from './ExampleReferenceSection';
import type { AIModel } from '@/hooks/useAIModel';

interface ExamConfigWizardProps {
  userId: string;
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
  onGenerate: () => void;
  generateDisabled?: boolean;
  generateLabel?: string;
  // Example reference
  exampleMode: 'none' | 'text' | 'image';
  setExampleMode: (m: 'none' | 'text' | 'image') => void;
  exampleText: string;
  setExampleText: (t: string) => void;
  exampleImageUrl: string;
  setExampleImageUrl: (url: string) => void;
  exampleImageUploading: boolean;
  setExampleImageUploading: (v: boolean) => void;
  /** Extra info line shown in summary (e.g. "10 páginas selecionadas") */
  summaryExtra?: string;
  /** Called when user presses Back on step 0 */
  onBackFromStart?: () => void;
}

type SubStep = 0 | 1 | 2;

const SUB_STEP_LABELS = ['Formato', 'Ajustes', 'Resumo'];
const SUB_STEP_ICONS = [ListChecks, Settings2, Play];

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const ExamConfigWizard = ({
  userId,
  totalQuestions, setTotalQuestions, writtenCount, setWrittenCount,
  optionsCount, setOptionsCount, timeLimit, setTimeLimit,
  model, setModel, totalCost, canAfford, onGenerate, generateDisabled,
  generateLabel = 'Gerar Prova com IA',
  exampleMode, setExampleMode, exampleText, setExampleText,
  exampleImageUrl, setExampleImageUrl, exampleImageUploading, setExampleImageUploading,
  summaryExtra, onBackFromStart,
}: ExamConfigWizardProps) => {
  const [subStep, setSubStep] = useState<SubStep>(0);
  const mcCount = Math.max(0, totalQuestions - writtenCount);

  const handleBack = () => {
    if (subStep > 0) {
      setSubStep((subStep - 1) as SubStep);
    } else {
      onBackFromStart?.();
    }
  };

  const handleNext = () => {
    if (subStep < 2) setSubStep((subStep + 1) as SubStep);
  };

  return (
    <div className="space-y-4">
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

      {/* Step content card */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
        {/* ── Step 0: Formato ── */}
        {subStep === 0 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground">Formato da prova</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Defina a quantidade e o tipo das questões.</p>
            </div>

            {/* Total questions stepper */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Total de questões</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl"
                  onClick={() => { const v = Math.max(1, totalQuestions - 1); setTotalQuestions(v); if (writtenCount > v) setWrittenCount(v); }}
                  disabled={totalQuestions <= 1}>
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="flex-1 text-center">
                  <span className="text-2xl font-black text-foreground tabular-nums">{totalQuestions}</span>
                  <p className="text-[10px] text-muted-foreground">questões</p>
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl"
                  onClick={() => { const v = Math.min(50, totalQuestions + 1); setTotalQuestions(v); }}
                  disabled={totalQuestions >= 50}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Question type distribution */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Distribuição</Label>
              <div className="grid grid-cols-2 gap-2">
                {/* MC card */}
                <button
                  className="rounded-xl border-2 border-primary bg-primary/5 p-3.5 text-left transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <CircleDot className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-primary">Múltipla Escolha</span>
                  </div>
                  <span className="text-2xl font-black text-foreground tabular-nums">{mcCount}</span>
                </button>
                {/* Written card */}
                <button
                  className="rounded-xl border-2 border-warning bg-warning/5 p-3.5 text-left transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <PenLine className="h-4 w-4 text-warning" />
                    <span className="text-xs font-bold text-warning">Dissertativas</span>
                  </div>
                  <span className="text-2xl font-black text-foreground tabular-nums">{writtenCount}</span>
                </button>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs text-muted-foreground shrink-0">Dissertativas:</Label>
                <input
                  type="range"
                  min={0}
                  max={totalQuestions}
                  value={writtenCount}
                  onChange={e => setWrittenCount(parseInt(e.target.value))}
                  className="flex-1 accent-warning h-2"
                />
                <span className="text-xs font-bold text-foreground tabular-nums w-6 text-right">{writtenCount}</span>
              </div>
            </div>

            {/* Options per MC question */}
            {mcCount > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Alternativas por questão</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([4, 5] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setOptionsCount(n)}
                      className={`rounded-xl border-2 py-3 px-4 transition-all ${
                        optionsCount === n
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-bold ${optionsCount === n ? 'text-primary' : 'text-foreground'}`}>
                          {n} opções
                        </span>
                        {optionsCount === n && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex gap-1">
                        {LETTERS.slice(0, n).map(l => (
                          <span key={l} className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
                            optionsCount === n ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>{l}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Ajustes ── */}
        {subStep === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground">Ajustes</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Tempo, referência de estilo e modelo de IA.</p>
            </div>

            <div>
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Tempo limite (minutos)
              </Label>
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
          </div>
        )}

        {/* ── Step 2: Resumo ── */}
        {subStep === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground">Resumo</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Confira as configurações antes de gerar.</p>
            </div>

            {/* Config summary */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total de questões</span>
                <span className="font-bold text-foreground">{totalQuestions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CircleDot className="h-3.5 w-3.5 text-primary" /> Múltipla escolha
                </span>
                <span className="font-bold text-foreground">{mcCount} ({optionsCount} alternativas)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <PenLine className="h-3.5 w-3.5 text-warning" /> Dissertativas
                </span>
                <span className="font-bold text-foreground">{writtenCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Tempo limite
                </span>
                <span className="font-bold text-foreground">{timeLimit > 0 ? `${timeLimit} min` : 'Sem limite'}</span>
              </div>
              {summaryExtra && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fonte</span>
                  <span className="font-bold text-foreground">{summaryExtra}</span>
                </div>
              )}
            </div>

            {/* Cost */}
            <div className={`rounded-xl border px-4 py-3 ${canAfford ? 'border-primary/20 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Custo estimado</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${canAfford ? 'text-primary' : 'text-destructive'}`}>{totalCost} Créditos</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {totalQuestions} questões × 2 créditos{model === 'pro' ? ' × 5' : ''} = {totalCost}
              </p>
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
        {(subStep > 0 || onBackFromStart) && (
          <Button variant="outline" onClick={handleBack} className="gap-1.5">
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        )}
        {subStep < 2 ? (
          <Button onClick={handleNext} className="flex-1 gap-1.5">
            Continuar <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={onGenerate} disabled={generateDisabled || !canAfford} className="flex-1 gap-2 h-12 text-base">
            <Sparkles className="h-5 w-5" /> {generateLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ExamConfigWizard;
