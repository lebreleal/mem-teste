/**
 * AI exam configuration form (deck-based generation).
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Clock, Zap } from 'lucide-react';
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
  // Example reference state
  exampleMode: 'none' | 'text' | 'image';
  setExampleMode: (m: 'none' | 'text' | 'image') => void;
  exampleText: string;
  setExampleText: (t: string) => void;
  exampleImageUrl: string;
  setExampleImageUrl: (url: string) => void;
  exampleImageUploading: boolean;
  setExampleImageUploading: (v: boolean) => void;
}

const AIExamConfig = ({
  userId, selectedDeckId, setSelectedDeckId, title, setTitle,
  totalQuestions, setTotalQuestions, writtenCount, setWrittenCount,
  optionsCount, setOptionsCount, timeLimit, setTimeLimit,
  model, setModel, totalCost, canAfford, activeDecks, onGenerate,
  exampleMode, setExampleMode, exampleText, setExampleText,
  exampleImageUrl, setExampleImageUrl, exampleImageUploading, setExampleImageUploading,
}: AIExamConfigProps) => {
  const mcCount = Math.max(0, totalQuestions - writtenCount);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Configurar Prova IA</h2>
            <p className="text-xs text-muted-foreground">A prova será gerada em background</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Baralho de referência</Label>
            <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
              <SelectContent>{activeDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-semibold">Título (opcional)</Label>
            <Input className="mt-1.5" placeholder="Ex: Prova de Anatomia" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-semibold">Total questões</Label>
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
          <p className="text-[11px] text-muted-foreground -mt-2">{mcCount} múltipla escolha + {writtenCount} dissertativas</p>

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
        </div>
      </div>

      {/* Cost */}
      <div className={`rounded-2xl border px-5 py-4 ${canAfford ? 'border-primary/20 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Custo estimado</span>
          </div>
          <span className={`text-sm font-bold tabular-nums ${canAfford ? 'text-primary' : 'text-destructive'}`}>{totalCost} Créditos IA</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{totalQuestions} questões × 2 créditos = {totalQuestions * 2}{model === 'pro' ? ' × 5 = ' + totalCost : ''}</p>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          <Zap className="inline h-3.5 w-3.5 text-primary mr-1" />
          Correção de dissertativas: <span className="font-bold text-foreground">gratuita 10x/dia</span>, após 2 Créditos IA.
        </p>
      </div>

      <Button className="w-full gap-2 h-12 text-base" size="lg" onClick={onGenerate} disabled={!selectedDeckId || !canAfford}>
        <Sparkles className="h-5 w-5" /> Gerar Prova com IA
      </Button>
    </div>
  );
};

export default AIExamConfig;
