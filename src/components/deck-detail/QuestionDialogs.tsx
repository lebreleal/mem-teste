/**
 * QuestionDialogs — Create, Edit, Paste, Preview, and Community warning dialogs.
 * Extracted per Lei 2B from DeckQuestionsTab.tsx (copy-paste integral).
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { useAISources, type AISource } from '@/hooks/useAISources';
import AISourceSelector from '@/components/AISourceSelector';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHtml } from '@/lib/sanitize';
import { conceptSlug, linkQuestionsToConcepts } from '@/services/globalConceptService';
import {
  countDescendantCards, createQuestion, fetchLatestQuestionId,
  updateQuestionConcepts, insertQuestionReturningId,
  updateDeckQuestion, updateGlobalConceptDescription,
  searchGlobalConcepts, getGlobalConceptBySlug,
  fetchUserGlobalConceptNames, invokeAITutor,
  invokeGenerateQuestions, invokeParseQuestions,
} from '@/services/deckQuestionService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  PenLine, Sparkles, Brain, Plus, X, Check,
  AlertCircle, Loader2, Zap, Crown, Search,
  Upload, FileText, Clock, ArrowUpRight,
} from 'lucide-react';
import type { DeckQuestion } from '@/components/deck-detail/question-types';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/* ════════════════════════════════════════════════════════════
   Question Creator Dialog
   ════════════════════════════════════════════════════════════ */
export const CreateQuestionDialog = ({
  open, onOpenChange, deckId, mode,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; deckId: string; mode: 'manual' | 'ai';
}) => {
  const { user } = useAuth();
  const { energy, spendEnergy } = useEnergy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null);
  const [correctExplanation, setCorrectExplanation] = useState('');
  const [wrongExplanations, setWrongExplanations] = useState<Record<number, string>>({});
  const [showExplanations, setShowExplanations] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiCustomInstructions, setAiCustomInstructions] = useState('');
  const [aiModel, setAiModel] = useState<'flash' | 'pro'>('flash');

  // AI Source state
  const { sources, saveText: saveTextSource, saveFile: saveFileSource } = useAISources();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<'none' | 'text' | 'file'>('none');
  const [loadingSourceContent, setLoadingSourceContent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedSource = sources.find(s => s.id === selectedSourceId);

  // Load source content when a saved source is selected
  const handleSelectSource = useCallback(async (source: AISource | null) => {
    if (!source) {
      setSelectedSourceId(null);
      setSourceText('');
      setSourceFile(null);
      setSourceMode('none');
      return;
    }
    setSelectedSourceId(source.id);
    if (source.source_type === 'text' && source.text_content) {
      setSourceText(source.text_content);
      setSourceMode('text');
    } else if (source.source_type === 'file') {
      setSourceMode('file');
      // For files, we'll pass the source ID to the edge function
    }
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFile(file);
    setSourceMode('file');
    setSelectedSourceId(null);
    // Auto-save source
    if (user) {
      saveFileSource.mutate(file);
    }
  }, [user, saveFileSource]);

  // Get source content for the AI call
  const getSourceContent = useCallback(async (): Promise<string | undefined> => {
    if (sourceMode === 'text' && sourceText.trim()) return sourceText.trim();
    if (sourceMode === 'file' && selectedSource?.text_content) return selectedSource.text_content;
    if (sourceMode === 'file' && selectedSource?.file_path) {
      try {
        const { downloadSourceFileAsText } = await import('@/services/aiSourceService');
        return await downloadSourceFileAsText(selectedSource);
      } catch {
        // If PDF or can't parse, return undefined — edge function can try
        return undefined;
      }
    }
    return undefined;
  }, [sourceMode, sourceText, selectedSource]);

  // Fetch card count for the deck (including sub-decks)
  const { data: cardCount = 0 } = useQuery({
    queryKey: ['deck-card-count', deckId],
    queryFn: () => countDescendantCards(deckId),
    enabled: !!deckId,
    staleTime: 60_000,
  });

  // Cost based on card count: 1 credit per 5 cards, min 2, multiplied by model
  const baseCost = Math.max(2, Math.ceil(cardCount / 5));
  const aiCost = aiModel === 'pro' ? baseCost * 5 : baseCost;

  const resetForm = () => {
    setQuestionText(''); setOptions(['', '', '', '']); setCorrectIdx(null);
    setCorrectExplanation(''); setWrongExplanations({}); setShowExplanations(false);
    setAiCustomInstructions('');
    setAiModel('flash');
  };

  const canAddE = options.length < 5;

  const buildExplanation = () => {
    const parts: string[] = [];
    if (correctExplanation.trim()) parts.push(`<strong>Resposta correta (${LETTERS[correctIdx ?? 0]}):</strong> ${correctExplanation.trim()}`);
    Object.entries(wrongExplanations).forEach(([idxStr, text]) => {
      const idx = Number(idxStr);
      if (text.trim() && idx !== correctIdx) parts.push(`<strong>${LETTERS[idx]} (incorreta):</strong> ${text.trim()}`);
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

      await createQuestion(deckId, user.id, {
        question_text: questionText.trim(),
        question_type: 'multiple_choice',
        options: validOptions,
        correct_indices: [correctIdx],
        explanation: buildExplanation(),
      });

      // Extract concepts via AI (fire and forget)
      invokeAITutor({ type: 'question-concepts', question: questionText.trim(), options: validOptions })
        .then(async (data) => {
          if (data?.concepts?.length > 0) {
            const latestId = await fetchLatestQuestionId(deckId, user.id);
            if (latestId) {
              await updateQuestionConcepts(latestId, data.concepts);
              const conceptDescs = data.conceptsWithDescriptions ?? [];
              await linkQuestionsToConcepts(user.id, [{
                questionId: latestId,
                conceptNames: data.concepts,
                conceptDescriptions: conceptDescs,
              }]);
              queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
          }
        }
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
      toast({ title: 'Questão criada!' }); onOpenChange(false); resetForm();
    },
    onError: (err: Error) => toast({ title: err.message || 'Erro ao criar questão', variant: 'destructive' }),
  });

  const [generationStep, setGenerationStep] = useState(0);

  const GENERATION_STEPS = [
    { label: 'Lendo os cards do baralho...', icon: '📖' },
    { label: 'Identificando conceitos relacionados...', icon: '🔗' },
    { label: 'Agrupando por clusters temáticos...', icon: '🧩' },
    { label: 'Gerando questões integradas...', icon: '✍️' },
    { label: 'Salvando questões...', icon: '💾' },
  ];

  const aiGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (cardCount === 0 && sourceMode === 'none') throw new Error('Adicione cards ou selecione uma fonte de referência');
      if (energy < aiCost) throw new Error(`Créditos insuficientes (necessário: ${aiCost})`);

      setAiGenerating(true);
      setGenerationStep(0);

      // Get source content if available
      const sourceContent = await getSourceContent();

      // Auto-save text source if it's new
      if (sourceMode === 'text' && sourceText.trim() && !selectedSourceId && user) {
        const name = sourceText.trim().slice(0, 50).replace(/\n/g, ' ') + '...';
        saveTextSource.mutate({ name, textContent: sourceText.trim() });
      }

      // Simulate progress steps while waiting for AI
      const stepInterval = setInterval(() => {
        setGenerationStep(prev => Math.min(prev + 1, 3));
      }, 3000);

      try {
        const data = await invokeGenerateQuestions({
            deckId,
            optionsCount: 4,
            aiModel: aiModel === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
            energyCost: aiCost,
            customInstructions: aiCustomInstructions.trim() || undefined,
            sourceContent: sourceContent || undefined,
        });

        clearInterval(stepInterval);

        const qs = data?.questions ?? [];
        if (qs.length === 0) throw new Error('Nenhuma questão gerada');

        setGenerationStep(4); // Saving step

        const questionConceptPairs: { questionId: string; conceptNames: string[]; prerequisites?: string[]; category?: string; subcategory?: string; conceptDescriptions?: { name: string; description: string }[] }[] = [];

        for (const qi of qs) {
          // Shuffle options so correct answer isn't always in the same position
          const opts = qi.options || [];
          const correctIdx = qi.correct_index ?? 0;
          const indices = opts.map((_: string, i: number) => i);
          // Fisher-Yates shuffle
          for (let j = indices.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [indices[j], indices[k]] = [indices[k], indices[j]];
          }
          const shuffledOpts = indices.map((i: number) => opts[i]);
          const newCorrectIdx = indices.indexOf(correctIdx);

          const insertedId = await insertQuestionReturningId(deckId, user.id, {
            question_text: qi.question_text || '',
            question_type: 'multiple_choice',
            options: shuffledOpts,
            correct_indices: [newCorrectIdx],
            explanation: qi.explanation || '',
            concepts: qi.concepts || [],
          });

          if (insertedId && qi.concepts?.length > 0) {
            questionConceptPairs.push({
              questionId: insertedId,
              conceptNames: qi.concepts,
              prerequisites: qi.prerequisites ?? [],
              category: qi.category ?? undefined,
              subcategory: qi.subcategory ?? undefined,
              conceptDescriptions: qi.concept_descriptions ?? [],
            });
          }
        }

        // Link all questions to global concepts (fire-and-forget)
        if (questionConceptPairs.length > 0) {
          linkQuestionsToConcepts(user.id, questionConceptPairs, { denseBatchLinking: true }).catch(console.error);
        }

        return qs.length;
      } catch (err) {
        clearInterval(stepInterval);
        throw err;
      }
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
      toast({ title: `${count} questões geradas por IA!` });
      onOpenChange(false); resetForm(); setAiGenerating(false); setGenerationStep(0);
    },
    onError: (err: any) => {
      setAiGenerating(false); setGenerationStep(0);
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
          aiGenerating ? (
            /* ── Generation Loading State ── */
            <div className="py-6 space-y-6">
              {/* Animated sparkle icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center animate-pulse">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary animate-ping opacity-30" />
                </div>
              </div>

              <div className="text-center">
                <h3 className="text-base font-bold text-foreground">Gerando questões...</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Analisando {cardCount} cards com modelo {aiModel === 'pro' ? 'Pro' : 'Flash'}
                </p>
              </div>

              {/* Progress steps */}
              <div className="space-y-2 px-2">
                {GENERATION_STEPS.map((step, i) => {
                  const isActive = i === generationStep;
                  const isDone = i < generationStep;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-500 ${
                        isActive ? 'bg-primary/10 border border-primary/20' :
                        isDone ? 'opacity-60' : 'opacity-30'
                      }`}
                    >
                      <span className="text-base w-6 text-center shrink-0">
                        {isDone ? <Check className="h-4 w-4 text-primary mx-auto" /> :
                         isActive ? <Loader2 className="h-4 w-4 text-primary mx-auto animate-spin" /> :
                         step.icon}
                      </span>
                      <span className={`text-sm ${isActive ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="px-2">
                <Progress value={((generationStep + 1) / GENERATION_STEPS.length) * 100} className="h-1.5" />
              </div>

              <p className="text-center text-[11px] text-muted-foreground">
                Isso pode levar alguns segundos dependendo da quantidade de cards.
              </p>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Card count header */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5">
              <p className="text-sm font-bold text-foreground">
                A IA vai analisar os <span className="text-primary">{cardCount} cards</span> do baralho
                {sourceMode !== 'none' && <span className="text-primary"> + fonte de referência</span>}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {sourceMode !== 'none'
                  ? 'O material anexado será usado como contexto adicional para gerar questões mais ricas.'
                  : 'Cards com conceitos relacionados serão agrupados em questões integradas de raciocínio.'}
              </p>
            </div>

            {cardCount === 0 && sourceMode === 'none' && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                Este baralho não tem cards. Adicione cards ou anexe uma fonte de referência.
              </div>
            )}

            {/* AI Source Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-primary" />
                Fonte de referência <span className="text-muted-foreground/60 font-normal">(opcional)</span>
              </label>

              <div className="flex items-center gap-2 flex-wrap">
                <AISourceSelector
                  selectedSourceId={selectedSourceId}
                  onSelectSource={handleSelectSource}
                />

                {sourceMode === 'none' && (
                  <>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                      onClick={() => setSourceMode('text')}>
                      <FileText className="h-3.5 w-3.5" /> Colar texto
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                      onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Enviar arquivo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.txt,.md,.doc,.docx"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </>
                )}
              </div>

              {sourceMode === 'text' && !selectedSourceId && (
                <div className="space-y-1.5">
                  <Textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder="Cole aqui o texto de referência (resumo, anotações, conteúdo da aula...)"
                    className="min-h-[80px] text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Fonte salva por até 30 dias para reutilização
                    </p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground"
                      onClick={() => { setSourceMode('none'); setSourceText(''); }}>
                      <X className="h-3 w-3 mr-1" /> Remover
                    </Button>
                  </div>
                </div>
              )}

              {sourceMode === 'file' && sourceFile && !selectedSourceId && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <Upload className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{sourceFile.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Arquivo salvo por até 30 dias
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground"
                    onClick={() => { setSourceMode('none'); setSourceFile(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Model selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Modelo de IA</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAiModel('flash')}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    aiModel === 'flash'
                      ? 'border-warning bg-warning/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="h-4 w-4 text-warning" />
                    <span className="text-sm font-bold text-foreground">Flash</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Rápido e econômico</p>
                  <p className="text-xs font-bold text-foreground tabular-nums">{baseCost} créditos</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAiModel('pro')}
                  className={`rounded-xl border-2 p-3 text-left transition-all relative overflow-hidden ${
                    aiModel === 'pro'
                      ? 'border-primary bg-primary/5 shadow-[0_0_20px_-4px_hsl(var(--primary)/0.3)]'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg uppercase tracking-wider">
                    5x
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold text-foreground">Pro</span>
                    <Crown className="h-3 w-3 text-warning" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Raciocínio avançado</p>
                  <p className="text-xs font-bold text-foreground tabular-nums">{baseCost * 5} créditos</p>
                </button>
              </div>
            </div>

            {/* Custom instructions */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Instruções extras <span className="text-muted-foreground/60">(opcional)</span>
              </label>
              <Textarea
                value={aiCustomInstructions}
                onChange={(e) => setAiCustomInstructions(e.target.value)}
                placeholder="Ex: Foque nos cards sobre anatomia, crie questões de caso clínico..."
                className="min-h-[50px] text-sm"
              />
            </div>

            {/* Cost + balance */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Custo:</span>
                <span className="font-bold text-foreground">{aiCost} créditos</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Saldo:</span>
                <span className={`font-bold ${energy >= aiCost ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{energy}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => aiGenerateMutation.mutate()}
                disabled={(cardCount === 0 && sourceMode === 'none') || energy < aiCost}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" /> Gerar questões
              </Button>
            </DialogFooter>
          </div>
          )
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Enunciado</label>
              <Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Digite o enunciado da questão..." className="min-h-[80px]" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Alternativas <span className="text-[10px] text-muted-foreground/60">(toque na letra para marcar a correta)</span>
              </label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button type="button" onClick={() => setCorrectIdx(i)}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                        correctIdx === i ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                      }`}>
                      {correctIdx === i ? <Check className="h-3.5 w-3.5" /> : LETTERS[i]}
                    </button>
                    <Input value={opt} onChange={(e) => { const next = [...options]; next[i] = e.target.value; setOptions(next); }} placeholder={`Alternativa ${LETTERS[i]}`} className="text-sm" />
                    {i === 4 && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => { setOptions(options.slice(0, 4)); if (correctIdx === 4) setCorrectIdx(null); const nw = { ...wrongExplanations }; delete nw[4]; setWrongExplanations(nw); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {canAddE && (
                <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs text-muted-foreground" onClick={() => setOptions([...options, ''])}>
                  <Plus className="h-3 w-3" /> Adicionar alternativa E
                </Button>
              )}
            </div>
            <div>
              <button type="button" onClick={() => setShowExplanations(!showExplanations)} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <AlertCircle className="h-3.5 w-3.5" /> {showExplanations ? 'Ocultar explicações' : 'Adicionar explicações (opcional)'}
              </button>
              {showExplanations && (
                <div className="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                  <div>
                    <label className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1"><Check className="h-3 w-3" /> Por que a alternativa {correctIdx !== null ? LETTERS[correctIdx] : '?'} está correta?</label>
                    <Textarea value={correctExplanation} onChange={(e) => setCorrectExplanation(e.target.value)} placeholder="Explique por que essa é a resposta certa..." className="min-h-[50px] text-xs" />
                  </div>
                  {options.map((opt, i) => {
                    if (i === correctIdx || !opt.trim()) return null;
                    return (
                      <div key={i}>
                        <label className="text-[11px] font-bold text-destructive/80 mb-1 flex items-center gap-1"><X className="h-3 w-3" /> Por que a alternativa {LETTERS[i]} está errada?</label>
                        <Textarea value={wrongExplanations[i] || ''} onChange={(e) => setWrongExplanations(prev => ({ ...prev, [i]: e.target.value }))} placeholder={`Explique por que "${opt.slice(0, 30)}..." está errada...`} className="min-h-[40px] text-xs" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar Questão'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ════════════════════════════════════════════════════════════
   Paste Questions Dialog — parse pasted text via AI
   ════════════════════════════════════════════════════════════ */
export const PasteQuestionsDialog = ({
  open, onOpenChange, deckId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; deckId: string;
}) => {
  const { user } = useAuth();
  const { energy } = useEnergy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pastedText, setPastedText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<any[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [aiModel, setAiModel] = useState<'flash' | 'pro'>('flash');

  const cost = aiModel === 'pro' ? 5 : 1;

  const resetForm = () => {
    setPastedText(''); setParsedQuestions(null); setParsing(false); setSaving(false);
    setSelectedIds(new Set()); setAiModel('flash');
  };

  const handleParse = async () => {
    if (!user || !pastedText.trim()) return;
    if (energy < cost) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setParsing(true);
    try {
      // Fetch existing global concepts for reuse
      const conceptNames = await fetchUserGlobalConceptNames(user.id);

      const data = await invokeParseQuestions({ text: pastedText, aiModel, existingConcepts: conceptNames });
      if (!data?.questions?.length) {
        toast({ title: 'Nenhuma questão encontrada no texto', variant: 'destructive' });
        setParsing(false);
        return;
      }
      setParsedQuestions(data.questions);
      setSelectedIds(new Set(data.questions.map((_: any, i: number) => i)));
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao processar texto', variant: 'destructive' });
    }
    setParsing(false);
  };

  const handleSave = async () => {
    if (!user || !parsedQuestions) return;
    setSaving(true);
    try {
      const toSave = parsedQuestions.filter((_, i) => selectedIds.has(i));
      const questionConceptPairs: { questionId: string; conceptNames: string[]; prerequisites?: string[]; category?: string; subcategory?: string; conceptDescriptions?: { name: string; description: string }[] }[] = [];

      for (const q of toSave) {
        const insertedId = await insertQuestionReturningId(deckId, user.id, {
          question_text: q.question_text,
          question_type: 'multiple_choice',
          options: q.options,
          correct_indices: q.correct_index >= 0 ? [q.correct_index] : [],
          explanation: q.explanation || '',
          concepts: q.concepts || [],
        });

        if (insertedId && q.concepts?.length > 0) {
          questionConceptPairs.push({
            questionId: insertedId,
            conceptNames: q.concepts,
            category: (q as any).category ?? undefined,
            subcategory: (q as any).subcategory ?? undefined,
          });
        }
      }

      if (questionConceptPairs.length > 0) {
        linkQuestionsToConcepts(user.id, questionConceptPairs, { denseBatchLinking: true }).catch(console.error);
      }

      queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
      toast({ title: `${toSave.length} questões importadas!` });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao salvar', variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleQuestion = (idx: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowUpRight className="h-5 w-5 text-primary" />
            Colar Questões
          </DialogTitle>
        </DialogHeader>

        {!parsedQuestions ? (
          /* ── Step 1: Paste text ── */
          <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
              <p className="text-sm font-bold text-foreground">
                Cole o texto com as questões
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                A IA vai identificar e extrair as questões automaticamente. Suporta diferentes formatos (a/b/c/d, 1/2/3/4, gabarito, etc).
              </p>
            </div>

            <Textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={"Cole aqui o texto com as questões...\n\nExemplo:\n1. Qual é a principal função do coração?\na) Filtrar sangue\nb) Bombear sangue ✓\nc) Produzir hormônios\nd) Digerir alimentos"}
              className="min-h-[180px] text-sm font-mono"
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted && !pastedText) {
                  setPastedText(pasted);
                  e.preventDefault();
                }
              }}
            />

            {/* Model selector + cost */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Modelo:</span>
                <div className="flex items-center rounded-lg border border-border/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAiModel('flash')}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      aiModel === 'flash'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ⚡ Flash
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiModel('pro')}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors flex items-center gap-1 ${
                      aiModel === 'pro'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Crown className="h-3 w-3" /> Pro
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span>Custo: <strong className="text-foreground">{cost} crédito{cost > 1 ? 's' : ''}</strong> · Saldo: <strong className={energy >= cost ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{energy}</strong></span>
              </div>
            </div>

            <DialogFooter className="shrink-0 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={handleParse}
                disabled={!pastedText.trim() || parsing || energy < cost}
                className="gap-1.5"
              >
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                {parsing ? 'Processando...' : 'Extrair questões'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ── Step 2: Review parsed questions ── */
          <div className="flex flex-col flex-1 min-h-0 space-y-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shrink-0">
              <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-500" />
                {parsedQuestions.length} questões encontradas
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Revise e desmarque as que não deseja importar.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-2.5 pr-1">
              {parsedQuestions.map((q, i) => {
                const isSelected = selectedIds.has(i);
                const hasCorrect = q.correct_index >= 0;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 transition-all cursor-pointer ${
                      isSelected ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-muted/20 opacity-50'
                    }`}
                    onClick={() => toggleQuestion(i)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleQuestion(i)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-relaxed">{q.question_text}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {q.options.map((opt: string, j: number) => (
                            <p key={j} className={`text-[11px] flex items-start gap-1 ${
                              hasCorrect && j === q.correct_index
                                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'text-muted-foreground'
                            }`}>
                              <span className="font-bold w-4 shrink-0">{LETTERS[j]}.</span>
                              <span className="break-words">{opt}</span>
                              {hasCorrect && j === q.correct_index && <Check className="h-3 w-3 shrink-0 mt-0.5" />}
                            </p>
                          ))}
                        </div>
                        {!hasCorrect && (
                          <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Gabarito não identificado
                          </p>
                        )}
                        {q.concepts?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {q.concepts.map((c: string, k: number) => (
                              <Badge key={k} variant="outline" className="text-[9px] h-4 px-1.5">{c}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="shrink-0 pt-2">
              <Button variant="outline" onClick={() => setParsedQuestions(null)}>
                Voltar
              </Button>
              <Button
                onClick={handleSave}
                disabled={selectedIds.size === 0 || saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {saving ? 'Salvando...' : `Importar ${selectedIds.size} questões`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ════════════════════════════════════════════════════════════
   Edit Question Dialog — with concept editing & explanation
   ════════════════════════════════════════════════════════════ */
export const EditQuestionDialog = ({
  question, open, onOpenChange, deckId, effectiveDeckId,
}: {
  question: DeckQuestion; open: boolean; onOpenChange: (v: boolean) => void; deckId: string; effectiveDeckId: string;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [questionText, setQuestionText] = useState(question.question_text);
  const [options, setOptions] = useState<string[]>(question.options.length > 0 ? [...question.options] : ['', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState<number | null>(question.correct_indices?.[0] ?? null);
  const [explanation, setExplanation] = useState(question.explanation || '');
  const [concepts, setConcepts] = useState<string[]>(question.concepts ?? []);
  const [conceptSearch, setConceptSearch] = useState('');
  const [conceptSuggestions, setConceptSuggestions] = useState<{ name: string; description: string | null; id: string }[]>([]);
  const [searchingConcepts, setSearchingConcepts] = useState(false);
  const [editingConcept, setEditingConcept] = useState<{ name: string; id: string; description: string | null } | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingConcept, setSavingConcept] = useState(false);

  // Debounced concept search
  useEffect(() => {
    if (!conceptSearch.trim() || !user) { setConceptSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSearchingConcepts(true);
      try {
        const results = await searchGlobalConcepts(user.id, conceptSearch);
        const filtered = results.filter(r => !concepts.some(c => conceptSlug(c) === conceptSlug(r.name)));
        setConceptSuggestions(filtered.map(r => ({ name: r.name, description: r.description, id: r.id })));
      } catch { setConceptSuggestions([]); }
      finally { setSearchingConcepts(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [conceptSearch, user, concepts]);

  const addConcept = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || concepts.some(c => conceptSlug(c) === conceptSlug(trimmed))) return;
    setConcepts(prev => [...prev, trimmed]);
    setConceptSearch('');
    setConceptSuggestions([]);
  };

  const removeConcept = (idx: number) => {
    setConcepts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConceptClick = async (conceptName: string) => {
    if (!user) return;
    const slug = conceptSlug(conceptName);
    const data = await getGlobalConceptBySlug(user.id, slug);
    if (data) {
      setEditingConcept({ name: data.name, id: data.id, description: data.description });
      setEditName(data.name);
      setEditDescription(data.description || '');
    }
  };

  const saveConceptEdit = async () => {
    if (!editingConcept) return;
    setSavingConcept(true);
    try {
      const { updateConceptMeta } = await import('@/services/globalConceptService');
      await updateConceptMeta(editingConcept.id, {
        name: editName.trim() || editingConcept.name,
      });
      // Update description separately
      await updateGlobalConceptDescription(editingConcept.id, editDescription.trim() || null);

      // Update local concept name if changed
      if (editName.trim() && editName.trim() !== editingConcept.name) {
        setConcepts(prev => prev.map(c => conceptSlug(c) === conceptSlug(editingConcept.name) ? editName.trim() : c));
      }
      toast({ title: 'Conceito atualizado!' });
      setEditingConcept(null);
    } catch { toast({ title: 'Erro ao salvar conceito', variant: 'destructive' }); }
    finally { setSavingConcept(false); }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const validOptions = options.filter(o => o.trim());
      if (validOptions.length < 2) throw new Error('Mínimo 2 alternativas');
      if (!questionText.trim()) throw new Error('Enunciado obrigatório');
      if (correctIdx === null) throw new Error('Marque a alternativa correta');

      await updateDeckQuestion(question.id, {
        question_text: questionText.trim(),
        options: validOptions,
        correct_indices: [correctIdx],
        explanation: explanation.trim(),
        concepts: concepts,
      });

      // Sync question_concepts junction
      if (user && concepts.length > 0) {
        linkQuestionsToConcepts(user.id, [{
          questionId: question.id,
          conceptNames: concepts,
        }]).catch(() => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', effectiveDeckId] });
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      toast({ title: 'Questão atualizada!' });
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao atualizar', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Questão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Enunciado */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Enunciado</label>
            <Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Digite o enunciado..." className="min-h-[80px]" />
          </div>

          {/* Alternativas */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Alternativas <span className="text-[10px] text-muted-foreground/60">(toque na letra para marcar a correta)</span>
            </label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button type="button" onClick={() => setCorrectIdx(i)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                      correctIdx === i ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    }`}>
                    {correctIdx === i ? <Check className="h-3.5 w-3.5" /> : LETTERS[i]}
                  </button>
                  <Input value={opt} onChange={(e) => { const next = [...options]; next[i] = e.target.value; setOptions(next); }} placeholder={`Alternativa ${LETTERS[i]}`} className="text-sm" />
                </div>
              ))}
            </div>
          </div>

          {/* Explicação */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Explicação</label>
            <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explicação da resposta correta..." className="min-h-[60px] text-sm" />
          </div>

          {/* Conceitos */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Brain className="h-3.5 w-3.5 text-primary" /> Conceitos (Knowledge Components)
            </label>

            {/* Chips dos conceitos atuais */}
            {concepts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {concepts.map((c, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="text-xs h-6 px-2 gap-1 cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => handleConceptClick(c)}
                  >
                    <span className="truncate max-w-[180px]">{c}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeConcept(i); }}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Input de busca */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={conceptSearch}
                  onChange={(e) => setConceptSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && conceptSearch.trim()) {
                      e.preventDefault();
                      addConcept(conceptSearch);
                    }
                  }}
                  placeholder="Buscar ou criar conceito..."
                  className="pl-8 text-sm h-8"
                />
                {searchingConcepts && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              {/* Dropdown de sugestões */}
              {(conceptSuggestions.length > 0 || (conceptSearch.trim() && !searchingConcepts)) && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[200px] overflow-y-auto">
                  {conceptSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => addConcept(s.name)}
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 text-primary border-primary/30">Meu</Badge>
                        <span className="text-xs font-medium text-foreground truncate">{s.name}</span>
                      </div>
                      {s.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                      )}
                    </button>
                  ))}
                  {conceptSearch.trim() && !conceptSuggestions.some(s => conceptSlug(s.name) === conceptSlug(conceptSearch)) && (
                    <button
                      type="button"
                      onClick={() => addConcept(conceptSearch)}
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="h-3 w-3 text-primary" />
                      <span className="text-xs text-foreground">Criar "<span className="font-medium">{conceptSearch.trim()}</span>"</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground mt-1">Clique num conceito para editar nome/descrição</p>
          </div>

          {/* Inline concept editor */}
          {editingConcept && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-foreground flex items-center gap-1">
                  <PenLine className="h-3 w-3 text-primary" /> Editar Conceito
                </p>
                <button type="button" onClick={() => setEditingConcept(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome do conceito" className="text-sm h-8" />
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descrição (15-30 palavras)..." className="min-h-[50px] text-xs" />
              <div className="flex justify-end">
                <Button size="sm" onClick={saveConceptEdit} disabled={savingConcept} className="h-7 text-xs gap-1">
                  {savingConcept ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ════════════════════════════════════════════════════════════
   Preview Dialog
   ════════════════════════════════════════════════════════════ */
export const QuestionPreviewDialog = ({
  question, onClose,
}: {
  question: DeckQuestion | null;
  onClose: () => void;
}) => {
  if (!question) return null;
  const opts = question.options ?? [];
  const cIdx = question.correct_indices?.[0] ?? 0;

  return (
    <Dialog open={!!question} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-visualização</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.question_text) }} />
          <div className="space-y-2">
            {opts.map((opt, i) => {
              const isCorrect = i === cIdx;
              return (
                <div key={i} className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                  isCorrect ? 'border-emerald-500 bg-emerald-500/10' : 'border-border/60 bg-card'
                }`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    isCorrect ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {isCorrect ? <Check className="h-3.5 w-3.5" /> : LETTERS[i]}
                  </span>
                  <span className="text-sm leading-relaxed pt-0.5">{opt}</span>
                </div>
              );
            })}
          </div>
          {question.explanation && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-bold text-primary mb-1">Explicação</p>
              <div className="text-xs text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.explanation) }} />
            </div>
          )}
          {question.concepts && question.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {question.concepts.map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ════════════════════════════════════════════════════════════
   Community Warning Dialog
   ════════════════════════════════════════════════════════════ */
export const CommunityWarningDialog = ({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Conteúdo da comunidade</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Questões vindas da comunidade não podem ser selecionadas para mover ou excluir.
        Apenas questões criadas por você podem ser gerenciadas.
      </p>
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>Entendi</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
