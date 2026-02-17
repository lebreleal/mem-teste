/**
 * Configuration step: detail level, card formats, count, model, instructions.
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, Sparkles, Minus, Plus, Check } from 'lucide-react';
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

const ConfigStep = ({
  detailLevel, onDetailLevelChange, cardFormats, onToggleFormat,
  targetCardCount, onTargetCardCountChange, customInstructions, onCustomInstructionsChange,
  model, onModelChange, selectedPageCount, totalCredits, energy, getCost,
  onBack, onGenerate,
}: ConfigStepProps) => (
  <div className="flex flex-col gap-3 flex-1 min-h-0">
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide max-h-[60dvh] sm:max-h-[65vh]">
      <div className="space-y-5">
        {/* Detail level */}
        <div className="space-y-2">
          <Label>Nível de detalhe</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DETAIL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => onDetailLevelChange(opt.value)}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  detailLevel === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                }`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-foreground">{opt.label}</span>
                  {detailLevel === opt.value && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Card format */}
        <div className="space-y-2">
          <Label>Formato do cartão</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FORMAT_OPTIONS.map(opt => {
              const active = cardFormats.includes(opt.value);
              return (
                <button key={opt.value} onClick={() => onToggleFormat(opt.value)}
                  className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-3 transition-colors ${
                    active ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                  }`}>
                  <span className="text-xs font-semibold text-foreground leading-tight">{opt.label}</span>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card count */}
        <div className="space-y-2">
          <Label>Quantidade de cartões</Label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onTargetCardCountChange(0)}
              className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-colors ${
                targetCardCount === 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-muted-foreground/30 text-foreground'
              }`}
            >
              Automático
            </button>
            <div className="flex items-center gap-2 flex-1">
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => onTargetCardCountChange(Math.max(5, (targetCardCount || 15) - 5))} disabled={targetCardCount > 0 && targetCardCount <= 5}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <div className="flex-1 text-center">
                <span className="text-lg font-bold text-foreground">{targetCardCount === 0 ? 'Auto' : targetCardCount}</span>
                <p className="text-[10px] text-muted-foreground">{targetCardCount === 0 ? 'IA decide' : 'cartões (aprox.)'}</p>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => onTargetCardCountChange(Math.min(50, (targetCardCount || 10) + 5))} disabled={targetCardCount >= 50}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Custom instructions */}
        <div className="space-y-2">
          <Label>Instruções adicionais (opcional)</Label>
          <Textarea value={customInstructions} onChange={e => onCustomInstructionsChange(e.target.value)}
            placeholder='Ex: "Concentre-se em datas e nomes"' rows={3} maxLength={500} className="resize-none" />
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <Label>Modelo de IA</Label>
          <AIModelSelector model={model} onChange={onModelChange} baseCost={CREDITS_PER_PAGE * selectedPageCount} />
        </div>

        {/* Credit summary */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p><span className="font-bold text-foreground">{selectedPageCount}</span> páginas · <span className="font-bold text-foreground">{getCost(CREDITS_PER_PAGE)}</span> créditos por página</p>
          <p>Total: <span className="font-bold" style={{ color: 'hsl(var(--energy-purple))' }}>{totalCredits} créditos IA</span></p>
        </div>
      </div>
    </div>

    <div className="flex gap-2 pt-2 border-t border-border/50">
      <Button variant="outline" onClick={onBack} className="gap-1.5">
        <ChevronLeft className="h-3.5 w-3.5" /> Voltar
      </Button>
      <Button onClick={onGenerate} disabled={totalCredits > energy} className="flex-1 gap-2">
        <Sparkles className="h-4 w-4" /> Gerar cartões ({totalCredits} créditos)
      </Button>
    </div>
  </div>
);

export default ConfigStep;
