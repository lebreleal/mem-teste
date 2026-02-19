/**
 * Configuration step: guided sub-steps for detail level, card formats,
 * count + instructions + model + summary.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Sparkles, Minus, Plus, Check, AlertTriangle } from 'lucide-react';
import AIModelSelector from '@/components/AIModelSelector';
import { DETAIL_OPTIONS, FORMAT_OPTIONS, CREDITS_PER_PAGE } from '@/types/ai';
import type { DetailLevel, CardFormat } from './types';
import type { AIModel } from '@/hooks/useAIModel';

interface ConfigStepProps {
  detailLevel: DetailLevel;
  onDetailLevelChange: (v: DetailLevel) => void;
  cardFormats: CardFormat[];
  onToggleFormat: (f: CardFormat) => void;
  targetCardCount: number;
  onTargetCardCountChange: (v: number) => void;
  customInstructions: string;
  onCustomInstructionsChange: (v: string) => void;
  model: AIModel;
  onModelChange: (v: AIModel) => void;
  selectedPageCount: number;
  totalCredits: number;
  energy: number;
  getCost: (base: number) => number;
  onBack: () => void;
  onGenerate: () => void;
}

type ConfigSubStep = 0 | 1 | 2;
const SUB_STEP_LABELS = ['Nível de detalhe', 'Formato do cartão', 'Ajustes finais'];

const ConfigStep = ({
  detailLevel, onDetailLevelChange, cardFormats, onToggleFormat,
  targetCardCount, onTargetCardCountChange, customInstructions, onCustomInstructionsChange,
  model, onModelChange, selectedPageCount, totalCredits, energy, getCost,
  onBack, onGenerate,
}: ConfigStepProps) => {
  const [subStep, setSubStep] = useState<ConfigSubStep>(0);
  const [showFormatWarning, setShowFormatWarning] = useState(false);
  const [showCountWarning, setShowCountWarning] = useState(false);

  const allFormatsSelected = cardFormats.length === FORMAT_OPTIONS.length;

  const handleToggleFormat = (f: CardFormat) => {
    const isSelected = cardFormats.includes(f);
    if (isSelected) {
      // Show warning when trying to deselect
      setShowFormatWarning(true);
    }
    onToggleFormat(f);
  };

  const handleCardCountChange = (v: number) => {
    if (v !== 0 && targetCardCount === 0) {
      setShowCountWarning(true);
    }
    onTargetCardCountChange(v);
  };

  const handleSubBack = () => {
    if (subStep === 0) {
      onBack();
    } else {
      setSubStep((subStep - 1) as ConfigSubStep);
    }
  };

  const handleSubNext = () => {
    if (subStep < 2) {
      setSubStep((subStep + 1) as ConfigSubStep);
    }
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Progress indicator */}
      <div className="flex items-center gap-1.5 px-1">
        {SUB_STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-1">
            <button
              onClick={() => i <= subStep ? setSubStep(i as ConfigSubStep) : undefined}
              className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
                i === subStep ? 'text-primary' : i < subStep ? 'text-primary/60 cursor-pointer' : 'text-muted-foreground/40'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                i < subStep ? 'bg-primary text-primary-foreground'
                  : i === subStep ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {i < subStep ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < 2 && <div className={`flex-1 h-px ${i < subStep ? 'bg-primary/40' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* Sub-step content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[55dvh] sm:max-h-[60vh]">
        {/* Sub-step 0: Detail level */}
        {subStep === 0 && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-bold">Nível de detalhe</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Escolha o quanto a IA deve aprofundar no conteúdo.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {DETAIL_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => onDetailLevelChange(opt.value)}
                  className={`rounded-xl border-2 p-3.5 text-left transition-all ${
                    detailLevel === opt.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{opt.label}</span>
                    {opt.value === 'standard' && detailLevel !== opt.value && (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">Recomendado</span>
                    )}
                    {detailLevel === opt.value && <Check className="h-4 w-4 text-primary ml-auto" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sub-step 1: Card format */}
        {subStep === 1 && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-bold">Formato do cartão</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Selecione os tipos de cartão a serem gerados.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {FORMAT_OPTIONS.map(opt => {
                const active = cardFormats.includes(opt.value);
                return (
                  <button key={opt.value} onClick={() => handleToggleFormat(opt.value)}
                    className={`flex items-center justify-between gap-2 rounded-xl border-2 px-4 py-3.5 transition-all ${
                      active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30'
                    }`}>
                    <span className="text-sm font-semibold text-foreground leading-tight">{opt.label}</span>
                    {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            {showFormatWarning && !allFormatsSelected && (
              <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p className="text-[11px] text-foreground/80 leading-snug">
                  Para uma <span className="font-bold">melhor retenção e aprendizagem</span>, recomendamos manter todos os tipos de cartão selecionados. A variedade de formatos ajuda a fixar o conteúdo de diferentes formas.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Sub-step 2: Count + Instructions + Model + Summary */}
        {subStep === 2 && (
          <div className="space-y-5">
            {/* Card count */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Quantidade de cartões</Label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { onTargetCardCountChange(0); setShowCountWarning(false); }}
                  className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-colors ${
                    targetCardCount === 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-muted-foreground/30 text-foreground'
                  }`}
                >
                  Automático
                </button>
                <div className="flex items-center gap-2 flex-1">
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => handleCardCountChange(Math.max(5, (targetCardCount || 15) - 5))} disabled={targetCardCount > 0 && targetCardCount <= 5}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-lg font-bold text-foreground">{targetCardCount === 0 ? 'Auto' : targetCardCount}</span>
                    <p className="text-[10px] text-muted-foreground">{targetCardCount === 0 ? 'IA decide' : 'cartões (aprox.)'}</p>
                  </div>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => handleCardCountChange(Math.min(50, (targetCardCount || 10) + 5))} disabled={targetCardCount >= 50}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {showCountWarning && targetCardCount !== 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] text-foreground/80 leading-snug">
                    Recomendamos deixar no <span className="font-bold">automático</span>. Ao limitar a quantidade, o conteúdo gerado pode ser insuficiente para contemplar todo o material enviado.
                  </p>
                </div>
              )}
            </div>

            {/* Custom instructions */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Instruções adicionais <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea value={customInstructions} onChange={e => onCustomInstructionsChange(e.target.value)}
                placeholder='Ex: "Concentre-se em datas e nomes"' rows={3} maxLength={500} className="resize-none" />
            </div>

            {/* Model selector */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Modelo de IA</Label>
              <AIModelSelector model={model} onChange={onModelChange} baseCost={CREDITS_PER_PAGE * selectedPageCount} />
            </div>

            {/* Credit summary */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p><span className="font-bold text-foreground">{selectedPageCount}</span> páginas · <span className="font-bold text-foreground">{getCost(CREDITS_PER_PAGE)}</span> créditos por página</p>
              <p>Total: <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{totalCredits} créditos IA</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="flex gap-2 pt-2 border-t border-border/50">
        <Button variant="outline" onClick={handleSubBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar
        </Button>
        {subStep < 2 ? (
          <Button onClick={handleSubNext} className="flex-1 gap-1.5">
            Continuar <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={onGenerate} disabled={totalCredits > energy} className="flex-1 gap-2">
            <Sparkles className="h-4 w-4" /> Gerar cartões ({totalCredits} créditos)
          </Button>
        )}
      </div>
    </div>
  );
};

export default ConfigStep;
