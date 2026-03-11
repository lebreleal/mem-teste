/**
 * DeckQuestionsTab — standalone question bank for a deck.
 * Questions are independent from exams. Style: one question at a time (Estratégia Concursos).
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  PenLine, Sparkles, Brain, Trash2, PlayCircle, Plus, X, Check,
  ChevronRight, AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DeckQuestion {
  id: string;
  deck_id: string;
  created_by: string;
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  correct_indices: number[] | null;
  explanation: string;
  sort_order: number;
  created_at: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** ─── Question Practice Mode (one at a time) ─── */
const QuestionPractice = ({
  questions,
  onClose,
}: {
  questions: DeckQuestion[];
  onClose: () => void;
}) => {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [finished, setFinished] = useState(false);

  const q = questions[index];

  const handleConfirm = useCallback(async () => {
    if (selected === null || !q) return;
    const isCorrect = q.correct_indices
      ? q.correct_indices.includes(selected)
      : selected === 0; // fallback
    setConfirmed(true);
    setStats(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Record attempt
    if (user) {
      await supabase.from('deck_question_attempts' as any).insert({
        question_id: q.id,
        user_id: user.id,
        selected_indices: [selected],
        is_correct: isCorrect,
      });
    }
  }, [selected, q, user]);

  const handleNext = useCallback(() => {
    if (index >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setIndex(prev => prev + 1);
    setSelected(null);
    setConfirmed(false);
  }, [index, questions.length]);

  if (finished) {
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Questões Finalizadas!</h2>
          <p className="text-muted-foreground">
            Você acertou <span className="font-bold text-primary">{stats.correct}</span> de{' '}
            <span className="font-bold">{stats.total}</span> ({pct}%)
          </p>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct >= 70 ? 'hsl(var(--primary))' : pct >= 40 ? 'hsl(var(--warning, 40 90% 60%))' : 'hsl(var(--destructive))',
              }}
            />
          </div>
          <Button onClick={onClose} className="mt-4">Voltar</Button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  const opts: string[] = Array.isArray(q.options) ? q.options : [];
  const correctIdx = q.correct_indices?.[0] ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-muted-foreground">
          <X className="h-4 w-4" /> Sair
        </Button>
        <span className="text-sm font-bold text-foreground tabular-nums">
          {index + 1}/{questions.length}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-primary font-bold">{stats.correct}</span>
          <span>/</span>
          <span>{stats.total}</span>
        </div>
      </header>

      {/* Progress */}
      <div className="h-1 w-full bg-muted/40">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${((index + 1) / questions.length) * 100}%`,
            background: 'hsl(var(--primary))',
          }}
        />
      </div>

      {/* Question content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Question number badge */}
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-xs font-bold">
            Questão {index + 1}
          </Badge>
          {q.question_type === 'multiple_choice' && (
            <Badge variant="secondary" className="text-[10px]">Múltipla escolha</Badge>
          )}
        </div>

        {/* Question text */}
        <div
          className="text-sm leading-relaxed text-foreground mb-6"
          dangerouslySetInnerHTML={{ __html: q.question_text }}
        />

        {/* Options */}
        <div className="space-y-2.5">
          {opts.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = i === correctIdx;
            let optClass = 'border-border/60 bg-card hover:border-primary/40 cursor-pointer';

            if (confirmed) {
              if (isCorrect) {
                optClass = 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30';
              } else if (isSelected && !isCorrect) {
                optClass = 'border-destructive bg-destructive/10 ring-1 ring-destructive/30';
              } else {
                optClass = 'border-border/40 bg-card/50 opacity-60';
              }
            } else if (isSelected) {
              optClass = 'border-primary bg-primary/5 ring-1 ring-primary/30';
            }

            return (
              <button
                key={i}
                onClick={() => !confirmed && setSelected(i)}
                disabled={confirmed}
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-3.5 transition-all ${optClass}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    confirmed && isCorrect
                      ? 'bg-emerald-500 text-white'
                      : confirmed && isSelected && !isCorrect
                      ? 'bg-destructive text-white'
                      : isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {LETTERS[i]}
                </span>
                <span className="text-sm leading-relaxed pt-0.5">{opt}</span>
              </button>
            );
          })}
        </div>

        {/* Explanation (after confirming) */}
        {confirmed && q.explanation && (
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-bold text-primary mb-1.5 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Explicação
            </p>
            <div
              className="text-sm text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: q.explanation }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 px-4 py-3">
        {!confirmed ? (
          <Button
            onClick={handleConfirm}
            disabled={selected === null}
            className="w-full gap-1.5"
          >
            <Check className="h-4 w-4" /> Confirmar Resposta
          </Button>
        ) : (
          <Button onClick={handleNext} className="w-full gap-1.5">
            {index >= questions.length - 1 ? 'Ver Resultado' : 'Próxima'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

/** ─── Question Creator Dialog ─── */
const CreateQuestionDialog = ({
  open,
  onOpenChange,
  deckId,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deckId: string;
  mode: 'manual' | 'ai';
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null);
  const [correctExplanation, setCorrectExplanation] = useState('');
  const [wrongExplanations, setWrongExplanations] = useState<Record<number, string>>({});
  const [showExplanations, setShowExplanations] = useState(false);

  // AI mode state
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiGenerating, setAiGenerating] = useState(false);

  const resetForm = () => {
    setQuestionText('');
    setOptions(['', '', '', '']);
    setCorrectIdx(null);
    setCorrectExplanation('');
    setWrongExplanations({});
    setShowExplanations(false);
    setAiTopic('');
  };

  const canAddE = options.length < 5;

  const buildExplanation = () => {
    const parts: string[] = [];
    if (correctExplanation.trim()) {
      parts.push(`<strong>Resposta correta (${LETTERS[correctIdx ?? 0]}):</strong> ${correctExplanation.trim()}`);
    }
    Object.entries(wrongExplanations).forEach(([idxStr, text]) => {
      const idx = Number(idxStr);
      if (text.trim() && idx !== correctIdx) {
        parts.push(`<strong>${LETTERS[idx]} (incorreta):</strong> ${text.trim()}`);
      }
    });
    return parts.join('<br/><br/>');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const validOptions = options.filter(o => o.trim());
      if (validOptions.length < 2) throw new Error('Mínimo 2 alternativas');
      if (!questionText.trim()) throw new Error('Enunciado obrigatório');
      if (correctIdx === null) throw new Error('Marque a alternativa correta');
      if (correctIdx >= validOptions.length) throw new Error('A alternativa correta foi removida');

      const { error } = await supabase.from('deck_questions' as any).insert({
        deck_id: deckId,
        created_by: user.id,
        question_text: questionText.trim(),
        question_type: 'multiple_choice',
        options: validOptions,
        correct_indices: [correctIdx],
        explanation: buildExplanation(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
      toast({ title: 'Questão criada!' });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: err.message || 'Erro ao criar questão', variant: 'destructive' });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (!aiTopic.trim()) throw new Error('Informe o tema');
      setAiGenerating(true);

      const { data, error } = await supabase.functions.invoke('generate-deck', {
        body: {
          type: 'questions',
          topic: aiTopic.trim(),
          count: aiCount,
          deckId,
        },
      });
      if (error) throw error;

      // Insert generated questions
      const questions = data?.questions ?? [];
      if (questions.length === 0) throw new Error('Nenhuma questão gerada');

      for (const q of questions) {
        await supabase.from('deck_questions' as any).insert({
          deck_id: deckId,
          created_by: user.id,
          question_text: q.question_text || q.question || '',
          question_type: 'multiple_choice',
          options: q.options || [],
          correct_indices: q.correct_indices ?? [q.correct_index ?? 0],
          explanation: q.explanation || '',
        });
      }
      return questions.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
      toast({ title: `${count} questões geradas por IA!` });
      onOpenChange(false);
      resetForm();
      setAiGenerating(false);
    },
    onError: (err: any) => {
      setAiGenerating(false);
      toast({ title: err.message || 'Erro ao gerar questões', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'ai' ? 'Gerar Questões com IA' : 'Nova Questão'}</DialogTitle>
        </DialogHeader>

        {mode === 'ai' ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tema / Assunto</label>
              <Textarea
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="Ex: Direito Constitucional - Princípios Fundamentais"
                className="min-h-[60px]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quantidade</label>
              <div className="flex gap-2">
                {[3, 5, 10].map(n => (
                  <Button
                    key={n}
                    variant={aiCount === n ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAiCount(n)}
                  >
                    {n} questões
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => aiGenerateMutation.mutate()}
                disabled={aiGenerating || !aiTopic.trim()}
                className="gap-1.5"
              >
                {aiGenerating ? 'Gerando...' : <><Sparkles className="h-3.5 w-3.5" /> Gerar</>}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Enunciado</label>
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Digite o enunciado da questão..."
                className="min-h-[80px]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Alternativas <span className="text-[10px] text-muted-foreground/60">(toque na letra para marcar a correta)</span>
              </label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectIdx(i)}
                      title={correctIdx === i ? 'Alternativa correta' : 'Marcar como correta'}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                        correctIdx === i
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                          : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      {correctIdx === i ? <Check className="h-3.5 w-3.5" /> : LETTERS[i]}
                    </button>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Alternativa ${LETTERS[i]}`}
                      className="text-sm"
                    />
                    {/* Remove 5th option */}
                    {i === 4 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setOptions(options.slice(0, 4));
                          if (correctIdx === 4) setCorrectIdx(null);
                          const newWrong = { ...wrongExplanations };
                          delete newWrong[4];
                          setWrongExplanations(newWrong);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {canAddE && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 gap-1 text-xs text-muted-foreground"
                  onClick={() => setOptions([...options, ''])}
                >
                  <Plus className="h-3 w-3" /> Adicionar alternativa E
                </Button>
              )}
            </div>

            {/* Explanations toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowExplanations(!showExplanations)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {showExplanations ? 'Ocultar explicações' : 'Adicionar explicações (opcional)'}
              </button>

              {showExplanations && (
                <div className="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                  {/* Correct answer explanation */}
                  <div>
                    <label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Por que a alternativa {correctIdx !== null ? LETTERS[correctIdx] : '?'} está correta?
                    </label>
                    <Textarea
                      value={correctExplanation}
                      onChange={(e) => setCorrectExplanation(e.target.value)}
                      placeholder="Explique por que essa é a resposta certa..."
                      className="min-h-[50px] text-xs"
                    />
                  </div>

                  {/* Wrong answers explanations */}
                  {options.map((opt, i) => {
                    if (i === correctIdx || !opt.trim()) return null;
                    return (
                      <div key={i}>
                        <label className="text-[11px] font-bold text-destructive/80 mb-1 flex items-center gap-1">
                          <X className="h-3 w-3" />
                          Por que a alternativa {LETTERS[i]} está errada?
                        </label>
                        <Textarea
                          value={wrongExplanations[i] || ''}
                          onChange={(e) => setWrongExplanations(prev => ({ ...prev, [i]: e.target.value }))}
                          placeholder={`Explique por que "${opt.slice(0, 30)}${opt.length > 30 ? '...' : ''}" está errada...`}
                          className="min-h-[40px] text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Questão'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** ─── Main Tab Component ─── */
const DeckQuestionsTab = ({
  deckId,
  isReadOnly = false,
  sourceDeckId,
}: {
  deckId: string;
  isReadOnly?: boolean;
  sourceDeckId?: string | null;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('manual');
  const [practicing, setPracticing] = useState(false);

  // For linked decks, fetch questions from the source deck
  const effectiveDeckId = sourceDeckId || deckId;

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['deck-questions', effectiveDeckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deck_questions' as any)
        .select('*')
        .eq('deck_id', effectiveDeckId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((q: any) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
      })) as DeckQuestion[];
    },
    enabled: !!effectiveDeckId,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (questionId: string) => {
      const { error } = await supabase.from('deck_questions' as any).delete().eq('id', questionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', effectiveDeckId] });
      toast({ title: 'Questão removida' });
    },
  });

  if (practicing && questions.length > 0) {
    return <QuestionPractice questions={questions} onClose={() => setPracticing(false)} />;
  }

  return (
    <div className="space-y-4">
      {/* Actions (only for deck owners) — aligned right */}
      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { setCreateMode('ai'); setCreateOpen(true); }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Gerar com IA
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { setCreateMode('manual'); setCreateOpen(true); }}
          >
            <PenLine className="h-3.5 w-3.5" /> Criar questão
          </Button>
        </div>
      )}

      {/* Practice button */}
      {questions.length > 0 && (
        <Button
          onClick={() => setPracticing(true)}
          className="w-full gap-2"
          variant="default"
        >
          <PlayCircle className="h-4 w-4" /> Praticar ({questions.length} questões)
        </Button>
      )}

      {/* Question list */}
      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-foreground">Banco de Questões</h3>
          <Badge variant="secondary">{questions.length}</Badge>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando questões...</div>
        ) : questions.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma questão criada para este deck ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {questions.map((q, idx) => {
              const opts: string[] = q.options;
              const correctIdx = q.correct_indices?.[0] ?? 0;
              return (
                <div key={q.id} className="rounded-xl border border-border/50 bg-background px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground line-clamp-2">
                        {idx + 1}. {q.question_text.replace(/<[^>]+>/g, '')}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {opts.slice(0, 5).map((opt, oi) => (
                          <span
                            key={oi}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              oi === correctIdx
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {LETTERS[oi]}
                          </span>
                        ))}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(q.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isReadOnly && (
        <CreateQuestionDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          deckId={deckId}
          mode={createMode}
        />
      )}
    </div>
  );
};

export default DeckQuestionsTab;
