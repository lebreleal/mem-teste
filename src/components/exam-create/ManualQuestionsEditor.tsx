/**
 * Manual questions editor for exam creation and editing.
 * Improved UX with better question type distribution visualization.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, PenLine, Save, Plus, Trash2, CheckCircle2, Zap, CircleDot } from 'lucide-react';
import { createEmptyQuestion, type ManualQuestion } from './types';

interface ManualQuestionsEditorProps {
  isEditing: boolean;
  manualTitle: string;
  setManualTitle: (v: string) => void;
  manualTimeLimit: number;
  setManualTimeLimit: (v: number) => void;
  manualOptionsCount: 4 | 5;
  setManualOptionsCount: (v: 4 | 5) => void;
  manualQuestions: ManualQuestion[];
  setManualQuestions: React.Dispatch<React.SetStateAction<ManualQuestion[]>>;
  selectedDeckId: string;
  setSelectedDeckId: (v: string) => void;
  activeDecks: { id: string; name: string }[];
  onSave: () => void;
  isSaving: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const ManualQuestionsEditor = ({
  isEditing, manualTitle, setManualTitle, manualTimeLimit, setManualTimeLimit,
  manualOptionsCount, setManualOptionsCount, manualQuestions, setManualQuestions,
  selectedDeckId, setSelectedDeckId, activeDecks, onSave, isSaving,
}: ManualQuestionsEditorProps) => {
  const updateQuestion = (id: string, updates: Partial<ManualQuestion>) => {
    setManualQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const updateOption = (qId: string, optIdx: number, value: string) => {
    setManualQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const newOpts = [...q.options];
      newOpts[optIdx] = value;
      return { ...q, options: newOpts };
    }));
  };

  const totalPoints = manualQuestions.reduce((sum, q) => sum + q.points, 0);
  const mcQuestions = manualQuestions.filter(q => q.type === 'multiple_choice');
  const writtenQuestions = manualQuestions.filter(q => q.type === 'written');

  return (
    <div className="space-y-5">
      {/* Config card */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            {isEditing ? <Save className="h-5 w-5 text-primary" /> : <PenLine className="h-5 w-5 text-primary" />}
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              {isEditing ? 'Editar Prova' : 'Prova Manual'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isEditing ? 'Edite questões, pontuação e configurações' : 'Crie suas questões livremente'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {!isEditing && (
            <div>
              <Label className="text-sm font-semibold">Baralho de referência</Label>
              <Select value={selectedDeckId} onValueChange={setSelectedDeckId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione um baralho" /></SelectTrigger>
                <SelectContent>{activeDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-sm font-semibold">Título da prova</Label>
            <Input className="mt-1.5" placeholder="Ex: Prova de Anatomia" value={manualTitle} onChange={e => setManualTitle(e.target.value)} />
          </div>

          <div>
            <Label className="text-sm font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Tempo limite (min)</Label>
            <Input type="number" min={0} className="mt-1.5" placeholder="0 = sem limite" value={manualTimeLimit || ''}
              onChange={e => setManualTimeLimit(Math.max(0, parseInt(e.target.value) || 0))} />
          </div>

          {/* Options count with ABCD/ABCDE visual */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Alternativas por questão</Label>
            <div className="grid grid-cols-2 gap-2">
              {([4, 5] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setManualOptionsCount(n)}
                  className={`rounded-xl border-2 py-3 px-4 transition-all ${
                    manualOptionsCount === n
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${manualOptionsCount === n ? 'text-primary' : 'text-foreground'}`}>
                      {n} opções
                    </span>
                    {manualOptionsCount === n && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex gap-1">
                    {LETTERS.slice(0, n).map(l => (
                      <span key={l} className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
                        manualOptionsCount === n ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>{l}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="rounded-2xl border border-border/50 bg-card px-5 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <span className="text-lg font-display font-black text-foreground">{manualQuestions.length}</span>
              <span className="text-[10px] text-muted-foreground block">questões</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <span className="text-lg font-display font-black text-foreground">{totalPoints.toFixed(1)}</span>
              <span className="text-[10px] text-muted-foreground block">pontos</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
              <CircleDot className="h-3 w-3" /> {mcQuestions.length}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-bold text-warning">
              <PenLine className="h-3 w-3" /> {writtenQuestions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {manualQuestions.map((q, idx) => (
          <div key={q.id} className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border/30">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                <div className="flex gap-1">
                  <button onClick={() => updateQuestion(q.id, { type: 'multiple_choice' })}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 ${
                      q.type === 'multiple_choice' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}>
                    <CircleDot className="h-3 w-3" /> Múltipla
                  </button>
                  <button onClick={() => updateQuestion(q.id, { type: 'written' })}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 ${
                      q.type === 'written' ? 'bg-warning text-warning-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}>
                    <PenLine className="h-3 w-3" /> Dissertativa
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">
                  <Input type="number" min={0.5} step={0.5} className="w-14 h-6 text-xs text-center border-0 bg-transparent shadow-none focus-visible:ring-0 p-0" value={q.points}
                    onChange={e => updateQuestion(q.id, { points: parseFloat(e.target.value) || 1 })} />
                  <span className="text-[10px] text-muted-foreground font-semibold">pts</span>
                </div>
                {manualQuestions.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setManualQuestions(prev => prev.filter(x => x.id !== q.id))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              <Textarea placeholder="Escreva o enunciado da questão..." className="min-h-[80px] text-sm resize-y border-border/50" value={q.questionText}
                onChange={e => updateQuestion(q.id, { questionText: e.target.value })} />

              {q.type === 'multiple_choice' ? (
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Alternativas (clique para marcar correta)</Label>
                  <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden">
                    {q.options.slice(0, manualOptionsCount).map((opt, optIdx) => (
                      <div key={optIdx}
                        onClick={() => updateQuestion(q.id, { correctIndex: optIdx })}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          q.correctIndex === optIdx ? 'bg-success/10' : 'hover:bg-muted/30'
                        }`}
                      >
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold shrink-0 ${
                          q.correctIndex === optIdx ? 'bg-success text-white' : 'bg-muted text-muted-foreground'
                        }`}>{LETTERS[optIdx]}</span>
                        <Input
                          className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 h-7 text-sm"
                          placeholder={`Alternativa ${LETTERS[optIdx]}`}
                          value={opt}
                          onChange={e => { e.stopPropagation(); updateOption(q.id, optIdx, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                        />
                        {q.correctIndex === optIdx && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Resposta esperada</Label>
                  <Textarea placeholder="Resposta correta esperada..." className="mt-1.5 min-h-[60px] text-sm resize-y border-border/50" value={q.correctAnswer}
                    onChange={e => updateQuestion(q.id, { correctAnswer: e.target.value })} />
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2 h-11 rounded-xl border-dashed border-2" size="sm"
            onClick={() => setManualQuestions(prev => [...prev, createEmptyQuestion('multiple_choice')])}>
            <CircleDot className="h-4 w-4" /> Múltipla Escolha
          </Button>
          <Button variant="outline" className="flex-1 gap-2 h-11 rounded-xl border-dashed border-2" size="sm"
            onClick={() => setManualQuestions(prev => [...prev, createEmptyQuestion('written')])}>
            <PenLine className="h-4 w-4" /> Dissertativa
          </Button>
        </div>
      </div>

      {!isEditing && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            <Zap className="inline h-3.5 w-3.5 text-primary mr-1" />
            Criar prova manual é <span className="font-bold text-foreground">gratuito</span>. Correção de dissertativas: gratuita 10x/dia.
          </p>
        </div>
      )}

      <Button className="w-full gap-2 h-12 text-base" size="lg" onClick={onSave} disabled={isSaving || (!isEditing && !selectedDeckId)}>
        {isEditing ? <><Save className="h-5 w-5" /> Salvar Alterações</> : <><PenLine className="h-5 w-5" /> Criar Prova</>}
      </Button>
    </div>
  );
};

export default ManualQuestionsEditor;
