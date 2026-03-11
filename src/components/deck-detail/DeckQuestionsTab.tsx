/**
 * DeckQuestionsTab — standalone question bank for a deck.
 * Features: stats bar, error notebook, concept mastery, AI hints/explanations,
 * option elimination (scissors), AI concept card generation.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  PenLine, Sparkles, Brain, Trash2, PlayCircle, Plus, X, Check,
  ChevronRight, AlertCircle, Scissors, Lightbulb, MessageSquareText, Loader2,
  BookX, Filter, Zap, Crown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';

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
  concepts: string[];
  sort_order: number;
  created_at: string;
}

interface QuestionAttempt {
  id: string;
  question_id: string;
  user_id: string;
  selected_indices: number[] | null;
  is_correct: boolean;
  answered_at: string;
}

interface ConceptMastery {
  id: string;
  concept: string;
  correct_count: number;
  wrong_count: number;
  mastery_level: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

type QuestionFilter = 'all' | 'unanswered' | 'errors';

/* ════════════════════════════════════════════════════════════
   Stats Bar
   ════════════════════════════════════════════════════════════ */
const QuestionStatsBar = ({
  total, answered, correct, wrong, errorCount, filter, onFilterChange,
}: {
  total: number; answered: number; correct: number; wrong: number; errorCount: number;
  filter: QuestionFilter; onFilterChange: (f: QuestionFilter) => void;
}) => {
  const pct = total > 0 ? Math.round((correct / Math.max(answered, 1)) * 100) : 0;
  const correctPct = total > 0 ? (correct / total) * 100 : 0;
  const wrongPct = total > 0 ? (wrong / total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
      {/* Counters */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-bold text-foreground text-sm">{total}</span> questões
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{answered}</span> respondidas
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">
            <span className="font-bold">{correct}</span> ✓
          </span>
          <span className="text-destructive">
            <span className="font-bold">{wrong}</span> ✗
          </span>
          {answered > 0 && (
            <span className="font-bold text-foreground">{pct}%</span>
          )}
        </div>
      </div>

      {/* Multi-color progress bar */}
      <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden flex">
        {correctPct > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${correctPct}%`, background: 'hsl(142 71% 45%)' }}
          />
        )}
        {wrongPct > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${wrongPct}%`, background: 'hsl(var(--destructive))' }}
          />
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5">
        {([
          { key: 'all' as const, label: 'Todas' },
          { key: 'unanswered' as const, label: 'Não respondidas' },
          { key: 'errors' as const, label: 'Caderno de Erros', count: errorCount },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filter === f.key
                ? 'border-primary bg-primary/10 text-primary font-bold'
                : 'border-border/50 text-muted-foreground hover:border-primary/30'
            }`}
          >
            {f.key === 'errors' && <BookX className="h-3 w-3" />}
            {f.key === 'unanswered' && <Filter className="h-3 w-3" />}
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className="ml-0.5 bg-destructive text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   Concept Self-Assessment (after answering)
   - If concept cards exist in deck → show preview
   - If not → offer to create or explain via AI
   ════════════════════════════════════════════════════════════ */
const ConceptMasterySection = ({
  concepts, deckId, questionId, onGenerateCards, generating,
}: {
  concepts: string[];
  deckId: string;
  questionId: string;
  onGenerateCards: (concept: string) => void;
  generating: string | null;
}) => {
  const [feedback, setFeedback] = useState<Record<string, 'yes' | 'no'>>({});
  const [conceptExplaining, setConceptExplaining] = useState<string | null>(null);
  const [conceptExplanations, setConceptExplanations] = useState<Record<string, string>>({});
  const [previewCards, setPreviewCards] = useState<Record<string, any[]>>({});
  const [loadingCards, setLoadingCards] = useState<Record<string, boolean>>({});
  const { energy, spendEnergy } = useEnergy();
  const { toast } = useToast();

  if (!concepts || concepts.length === 0) return null;

  const handleFeedback = (concept: string, value: 'yes' | 'no') => {
    setFeedback(prev => ({ ...prev, [concept]: value }));
    if (value === 'no') {
      // Search for existing cards related to this concept in the deck
      searchExistingCards(concept);
    }
  };

  const searchExistingCards = async (concept: string) => {
    setLoadingCards(prev => ({ ...prev, [concept]: true }));
    try {
      // Search cards whose front or back contains keywords from the concept
      const keywords = concept
        .replace(/^(Você conseguiu|Você entendeu|Você sabe).*?\??\s*/i, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 4);

      if (keywords.length === 0) { setLoadingCards(prev => ({ ...prev, [concept]: false })); return; }

      const { data } = await supabase
        .from('cards')
        .select('id, front_content, back_content, card_type')
        .eq('deck_id', deckId)
        .or(keywords.map(k => `front_content.ilike.%${k}%,back_content.ilike.%${k}%`).join(','))
        .limit(5);

      setPreviewCards(prev => ({ ...prev, [concept]: data || [] }));
    } catch { /* ignore */ }
    finally { setLoadingCards(prev => ({ ...prev, [concept]: false })); }
  };

  const handleExplainConcept = async (concept: string) => {
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setConceptExplaining(concept);
    try {
      spendEnergy.mutate(1);
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: { type: 'explain-concept', concept, deckId },
      });
      if (error) throw error;
      setConceptExplanations(prev => ({ ...prev, [concept]: data?.response || 'Explicação indisponível.' }));
    } catch { toast({ title: 'Erro ao explicar conceito', variant: 'destructive' }); }
    finally { setConceptExplaining(null); }
  };

  return (
    <div className="mt-5 rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
      <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Autoavaliação
      </p>
      <p className="text-[11px] text-muted-foreground">
        Avalie sua compreensão sobre os conceitos testados:
      </p>
      <div className="space-y-3">
        {concepts.map((c, i) => {
          const answer = feedback[c];
          const existingCards = previewCards[c] || [];
          const isLoadingConcept = loadingCards[c];
          const explanation = conceptExplanations[c];

          return (
            <div key={i} className="rounded-lg border border-border/40 bg-background/50 p-3 space-y-2.5">
              <p className="text-sm text-foreground leading-relaxed">{c}</p>

              {!answer ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm"
                    className="h-7 px-3 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => handleFeedback(c, 'yes')}>
                    <Check className="h-3 w-3" /> Sim, entendi
                  </Button>
                  <Button variant="outline" size="sm"
                    className="h-7 px-3 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => handleFeedback(c, 'no')}>
                    <X className="h-3 w-3" /> Não entendi
                  </Button>
                </div>
              ) : answer === 'yes' ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check className="h-3 w-3" /> Conceito compreendido ✓
                </span>
              ) : (
                <div className="space-y-2.5">
                  {isLoadingConcept ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando cards relacionados...
                    </div>
                  ) : existingCards.length > 0 ? (
                    /* Show existing cards from deck */
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-primary" />
                        <span><span className="font-bold text-foreground">{existingCards.length}</span> cards relacionados encontrados no seu baralho:</span>
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {existingCards.map(card => (
                          <div key={card.id} className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2">
                            <div className="text-xs text-foreground line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: card.front_content }} />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Revise esses cards na próxima sessão de estudo para reforçar o conceito.
                      </p>
                    </div>
                  ) : (
                    /* No existing cards — offer to create */
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                        <AlertCircle className="h-3 w-3" /> Nenhum card encontrado.
                      </span>
                      <Button variant="default" size="sm" className="h-7 px-3 text-xs gap-1.5"
                        onClick={() => onGenerateCards(c)} disabled={generating === c}>
                        {generating === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        Criar cards (2 créditos)
                      </Button>
                    </div>
                  )}

                  {/* AI explanation for concept */}
                  {!explanation ? (
                    <button
                      onClick={() => handleExplainConcept(c)}
                      disabled={conceptExplaining === c}
                      className="flex items-center gap-1 text-xs text-primary font-medium hover:underline disabled:opacity-50"
                    >
                      {conceptExplaining === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquareText className="h-3 w-3" />}
                      Explicar conceito com IA (1 crédito)
                    </button>
                  ) : (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-[11px] font-bold text-primary mb-1 flex items-center gap-1">
                        <MessageSquareText className="h-3 w-3" /> Explicação do conceito
                      </p>
                      <div className="text-xs text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{explanation}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   Question Practice Mode
   ════════════════════════════════════════════════════════════ */
const QuestionPractice = ({
  questions, deckId, onClose,
}: {
  questions: DeckQuestion[]; deckId: string; onClose: () => void;
}) => {
  const { user } = useAuth();
  const { energy, spendEnergy } = useEnergy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [finished, setFinished] = useState(false);
  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const [scissorsMode, setScissorsMode] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [generatingConcept, setGeneratingConcept] = useState<string | null>(null);

  // Concept mastery for current deck
  const { data: conceptMastery = [] } = useQuery({
    queryKey: ['concept-mastery', deckId, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('deck_concept_mastery' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('deck_id', deckId);
      return (data ?? []) as unknown as ConceptMastery[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const q = questions[index];

  const resetForNext = useCallback(() => {
    setSelected(null);
    setConfirmed(false);
    setEliminated(new Set());
    setScissorsMode(false);
    setHintText(null);
    setExplainText(null);
    setHintLoading(false);
    setExplainLoading(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selected === null || !q || !user) return;
    const isCorrect = q.correct_indices ? q.correct_indices.includes(selected) : selected === 0;
    setConfirmed(true);
    setScissorsMode(false);
    setStats(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));

    // Save attempt
    await supabase.from('deck_question_attempts' as any).insert({
      question_id: q.id, user_id: user.id, selected_indices: [selected], is_correct: isCorrect,
    });

    // Update concept mastery
    if (q.concepts && q.concepts.length > 0) {
      for (const concept of q.concepts) {
        const existing = conceptMastery.find(m => m.concept === concept);
        const newCorrect = (existing?.correct_count || 0) + (isCorrect ? 1 : 0);
        const newWrong = (existing?.wrong_count || 0) + (isCorrect ? 0 : 1);
        const total = newCorrect + newWrong;
        const rate = total > 0 ? newCorrect / total : 0;
        const newLevel = rate >= 0.75 && total >= 3 ? 'strong' : rate >= 0.5 ? 'learning' : 'weak';

        await supabase.from('deck_concept_mastery' as any).upsert({
          user_id: user.id,
          deck_id: deckId,
          concept,
          correct_count: newCorrect,
          wrong_count: newWrong,
          mastery_level: newLevel,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,deck_id,concept' });
      }
      queryClient.invalidateQueries({ queryKey: ['concept-mastery', deckId, user.id] });
    }

    queryClient.invalidateQueries({ queryKey: ['question-attempts', deckId] });
  }, [selected, q, user, deckId, conceptMastery, queryClient]);

  const handleNext = useCallback(() => {
    if (index >= questions.length - 1) { setFinished(true); return; }
    setIndex(prev => prev + 1);
    resetForNext();
  }, [index, questions.length, resetForNext]);

  const handleEliminate = useCallback((optIdx: number) => {
    setEliminated(prev => {
      const next = new Set(prev);
      if (next.has(optIdx)) next.delete(optIdx); else next.add(optIdx);
      return next;
    });
    if (selected === optIdx) setSelected(null);
  }, [selected]);

  const handleHint = useCallback(async () => {
    if (!q || !user) return;
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setHintLoading(true);
    try {
      spendEnergy.mutate(1);
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: { type: 'question-hint', question: q.question_text, options: q.options, correctIndex: q.correct_indices?.[0] ?? 0 },
      });
      if (error) throw error;
      setHintText(data?.response || 'Tente analisar cada alternativa com cuidado.');
    } catch { toast({ title: 'Erro ao gerar dica', variant: 'destructive' }); }
    finally { setHintLoading(false); }
  }, [q, user, energy, spendEnergy, toast]);

  const handleExplain = useCallback(async () => {
    if (!q || !user) return;
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setExplainLoading(true);
    try {
      spendEnergy.mutate(1);
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: { type: 'question-explain', question: q.question_text, options: q.options, correctIndex: q.correct_indices?.[0] ?? 0, userAnswer: selected },
      });
      if (error) throw error;
      setExplainText(data?.response || 'Não foi possível gerar a explicação.');
    } catch { toast({ title: 'Erro ao gerar explicação', variant: 'destructive' }); }
    finally { setExplainLoading(false); }
  }, [q, user, energy, selected, spendEnergy, toast]);

  const handleGenerateConceptCards = useCallback(async (concept: string) => {
    if (!user || !q) return;
    if (energy < 2) { toast({ title: 'Créditos insuficientes (2 necessários)', variant: 'destructive' }); return; }
    setGeneratingConcept(concept);
    try {
      spendEnergy.mutate(2);
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: { type: 'generate-concept-cards', concept, deckId, energyCost: 0 },
      });
      if (error) throw error;
      const cards = data?.cards || [];
      if (cards.length > 0) {
        for (const card of cards) {
          await supabase.from('cards').insert({
            deck_id: deckId,
            front_content: card.front,
            back_content: card.back,
            card_type: card.card_type || 'basic',
          });
        }
        toast({ title: `${cards.length} cards criados para "${concept}"` });
        queryClient.invalidateQueries({ queryKey: ['cards'] });
      } else {
        toast({ title: 'Nenhum card gerado', variant: 'destructive' });
      }
    } catch { toast({ title: 'Erro ao gerar cards', variant: 'destructive' }); }
    finally { setGeneratingConcept(null); }
  }, [user, q, energy, deckId, spendEnergy, toast, queryClient]);

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
                background: pct >= 70 ? 'hsl(142 71% 45%)' : pct >= 40 ? 'hsl(40 90% 60%)' : 'hsl(var(--destructive))',
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
  const wasCorrect = confirmed && selected !== null && q.correct_indices?.includes(selected);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-muted-foreground">
          <X className="h-4 w-4" /> Sair
        </Button>
        <span className="text-sm font-bold text-foreground tabular-nums">{index + 1}/{questions.length}</span>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 rounded-xl px-2 py-1" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground tabular-nums">{energy}</span>
          </div>
          <span className="text-primary font-bold">{stats.correct}</span>/<span>{stats.total}</span>
        </div>
      </header>

      {/* Progress */}
      <div className="h-1 w-full bg-muted/40">
        <div className="h-full transition-all duration-300" style={{ width: `${((index + 1) / questions.length) * 100}%`, background: 'hsl(var(--primary))' }} />
      </div>

      {/* Question content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-xs font-bold">Questão {index + 1}</Badge>
        </div>

        <div className="text-sm leading-relaxed text-foreground mb-6" dangerouslySetInnerHTML={{ __html: q.question_text }} />

        {/* Options */}
        <div className="space-y-2.5">
          {opts.map((opt, i) => {
            const isEliminated = eliminated.has(i);
            const isSelected = selected === i;
            const isCorrectOpt = i === correctIdx;

            if (isEliminated && !confirmed) {
              return (
                <button key={i} onClick={() => scissorsMode && handleEliminate(i)}
                  className="w-full text-left flex items-start gap-3 rounded-xl border p-3.5 transition-all border-border/30 bg-card/30 opacity-40 cursor-pointer">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold bg-muted text-muted-foreground line-through">{LETTERS[i]}</span>
                  <span className="text-sm leading-relaxed pt-0.5 line-through text-muted-foreground">{opt}</span>
                  {scissorsMode && <span className="ml-auto text-[10px] text-primary font-medium">restaurar</span>}
                </button>
              );
            }

            let optClass = 'border-border/60 bg-card hover:border-primary/40 cursor-pointer';
            if (confirmed) {
              if (isCorrectOpt) optClass = 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30';
              else if (isSelected && !isCorrectOpt) optClass = 'border-destructive bg-destructive/10 ring-1 ring-destructive/30';
              else optClass = 'border-border/40 bg-card/50 opacity-60';
            } else if (isSelected) {
              optClass = 'border-primary bg-primary/5 ring-1 ring-primary/30';
            }

            return (
              <button key={i}
                onClick={() => { if (confirmed) return; scissorsMode ? handleEliminate(i) : setSelected(i); }}
                disabled={confirmed}
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-3.5 transition-all ${optClass}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  confirmed && isCorrectOpt ? 'bg-emerald-500 text-white'
                    : confirmed && isSelected && !isCorrectOpt ? 'bg-destructive text-white'
                    : isSelected ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {confirmed && isCorrectOpt ? <Check className="h-3.5 w-3.5" /> : LETTERS[i]}
                </span>
                <span className="text-sm leading-relaxed pt-0.5 flex-1">{opt}</span>
                {scissorsMode && !confirmed && <Scissors className="h-4 w-4 text-destructive/60 shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>

        {/* Hint */}
        {!confirmed && hintText && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
              <Lightbulb className="h-3.5 w-3.5" /> Dica
            </p>
            <div className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{hintText}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Static explanation */}
        {confirmed && q.explanation && (
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-bold text-primary mb-1.5 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> Explicação
            </p>
            <div className="text-sm text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: q.explanation }} />
          </div>
        )}

        {/* AI Explanation */}
        {confirmed && explainText && (
          <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
              <Brain className="h-3.5 w-3.5" /> Explicação da IA
            </p>
            <div className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{explainText}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Concept Mastery (after confirming, if question has concepts) */}
        {confirmed && q.concepts && q.concepts.length > 0 && (
          <ConceptMasterySection
            concepts={q.concepts}
            mastery={conceptMastery}
            onGenerateCards={handleGenerateConceptCards}
            generating={generatingConcept}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 px-4 py-3 space-y-2">
        {!confirmed ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Button variant={scissorsMode ? 'default' : 'outline'} size="sm" className="gap-1.5 text-xs" onClick={() => setScissorsMode(!scissorsMode)}>
                <Scissors className="h-3.5 w-3.5" /> {scissorsMode ? 'Saindo' : 'Eliminar'}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleHint} disabled={hintLoading || !!hintText}>
                {hintLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
                Dica <span className="text-[10px] text-muted-foreground font-normal ml-0.5">(1 <Brain className="inline h-2.5 w-2.5" />)</span>
              </Button>
            </div>
            <Button onClick={handleConfirm} disabled={selected === null} className="w-full gap-1.5">
              <Check className="h-4 w-4" /> Confirmar Resposta
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            {!explainText && (
              <Button variant="outline" className="w-full gap-1.5 text-sm" onClick={handleExplain} disabled={explainLoading}>
                {explainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                Pedir IA para explicar <span className="text-[10px] text-muted-foreground font-normal ml-0.5">(1 <Brain className="inline h-2.5 w-2.5" />)</span>
              </Button>
            )}
            <Button onClick={handleNext} className="w-full gap-1.5">
              {index >= questions.length - 1 ? 'Ver Resultado' : 'Próxima'} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   Question Creator Dialog
   ════════════════════════════════════════════════════════════ */
const CreateQuestionDialog = ({
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

  // Fetch card count for the deck (including sub-decks)
  const { data: cardCount = 0 } = useQuery({
    queryKey: ['deck-card-count', deckId],
    queryFn: async () => {
      const { data } = await supabase.rpc('count_descendant_cards_by_state', { p_deck_id: deckId });
      return (data as any)?.total ?? 0;
    },
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

      const { error } = await supabase.from('deck_questions' as any).insert({
        deck_id: deckId, created_by: user.id, question_text: questionText.trim(),
        question_type: 'multiple_choice', options: validOptions,
        correct_indices: [correctIdx], explanation: buildExplanation(),
      });
      if (error) throw error;

      // Extract concepts via AI (fire and forget)
      supabase.functions.invoke('ai-tutor', {
        body: { type: 'question-concepts', question: questionText.trim(), options: validOptions },
      }).then(async ({ data }) => {
        if (data?.concepts?.length > 0) {
          const { data: latest } = await supabase.from('deck_questions' as any)
            .select('id').eq('deck_id', deckId).eq('created_by', user.id)
            .order('created_at', { ascending: false }).limit(1);
          if (latest?.[0]) {
            await supabase.from('deck_questions' as any).update({ concepts: data.concepts }).eq('id', (latest[0] as any).id);
            queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
          }
        }
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', deckId] });
      toast({ title: 'Questão criada!' }); onOpenChange(false); resetForm();
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao criar questão', variant: 'destructive' }),
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
      if (cardCount === 0) throw new Error('Este baralho não tem cards para gerar questões');
      if (energy < aiCost) throw new Error(`Créditos insuficientes (necessário: ${aiCost})`);

      setAiGenerating(true);
      setGenerationStep(0);

      // Simulate progress steps while waiting for AI
      const stepInterval = setInterval(() => {
        setGenerationStep(prev => Math.min(prev + 1, 3));
      }, 3000);

      try {
        const { data, error } = await supabase.functions.invoke('generate-questions', {
          body: {
            deckId,
            optionsCount: 4,
            aiModel: aiModel === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
            energyCost: aiCost,
            customInstructions: aiCustomInstructions.trim() || undefined,
          },
        });

        clearInterval(stepInterval);

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const qs = data?.questions ?? [];
        if (qs.length === 0) throw new Error('Nenhuma questão gerada');

        setGenerationStep(4); // Saving step

        for (const qi of qs) {
          await supabase.from('deck_questions' as any).insert({
            deck_id: deckId, created_by: user.id,
            question_text: qi.question_text || '',
            question_type: 'multiple_choice',
            options: qi.options || [],
            correct_indices: [qi.correct_index ?? 0],
            explanation: qi.explanation || '',
            concepts: qi.concepts || [],
          });
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
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cards com conceitos relacionados serão agrupados em questões integradas de raciocínio.
              </p>
            </div>

            {cardCount === 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                Este baralho não tem cards. Adicione cards antes de gerar questões.
              </div>
            )}

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
                disabled={cardCount === 0 || energy < aiCost}
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
   Main Tab Component
   ════════════════════════════════════════════════════════════ */
const DeckQuestionsTab = ({
  deckId, isReadOnly = false, sourceDeckId,
}: {
  deckId: string; isReadOnly?: boolean; sourceDeckId?: string | null;
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('manual');
  const [practicing, setPracticing] = useState(false);
  const [filter, setFilter] = useState<QuestionFilter>('all');

  const effectiveDeckId = sourceDeckId || deckId;

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['deck-questions', effectiveDeckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deck_questions' as any).select('*')
        .eq('deck_id', effectiveDeckId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((q: any) => ({
        ...q, options: Array.isArray(q.options) ? q.options : [], concepts: Array.isArray(q.concepts) ? q.concepts : [],
      })) as DeckQuestion[];
    },
    enabled: !!effectiveDeckId,
    staleTime: 30_000,
  });

  // Fetch user's attempts for stats
  const { data: attempts = [] } = useQuery({
    queryKey: ['question-attempts', effectiveDeckId],
    queryFn: async () => {
      if (!user) return [];
      const questionIds = questions.map(q => q.id);
      if (questionIds.length === 0) return [];
      const { data } = await supabase
        .from('deck_question_attempts' as any).select('*')
        .eq('user_id', user.id)
        .in('question_id', questionIds);
      return (data ?? []) as unknown as QuestionAttempt[];
    },
    enabled: !!user && questions.length > 0,
    staleTime: 30_000,
  });

  // Compute stats
  const statsData = useMemo(() => {
    const total = questions.length;
    // Group attempts by question — take latest attempt per question
    const latestByQ = new Map<string, QuestionAttempt>();
    for (const a of attempts) {
      const prev = latestByQ.get(a.question_id);
      if (!prev || a.answered_at > prev.answered_at) latestByQ.set(a.question_id, a);
    }
    const answered = latestByQ.size;
    let correct = 0, wrong = 0;
    const errorQuestionIds = new Set<string>();
    const answeredQuestionIds = new Set<string>();

    for (const [qId, a] of latestByQ) {
      answeredQuestionIds.add(qId);
      if (a.is_correct) correct++;
      else { wrong++; errorQuestionIds.add(qId); }
    }
    return { total, answered, correct, wrong, errorQuestionIds, answeredQuestionIds };
  }, [questions, attempts]);

  // Filter questions
  const filteredQuestions = useMemo(() => {
    if (filter === 'unanswered') return questions.filter(q => !statsData.answeredQuestionIds.has(q.id));
    if (filter === 'errors') return questions.filter(q => statsData.errorQuestionIds.has(q.id));
    return questions;
  }, [questions, filter, statsData]);

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

  if (practicing && filteredQuestions.length > 0) {
    return <QuestionPractice questions={filteredQuestions} deckId={deckId} onClose={() => setPracticing(false)} />;
  }

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      {questions.length > 0 && (
        <QuestionStatsBar
          total={statsData.total}
          answered={statsData.answered}
          correct={statsData.correct}
          wrong={statsData.wrong}
          errorCount={statsData.errorQuestionIds.size}
          filter={filter}
          onFilterChange={setFilter}
        />
      )}

      {/* Actions */}
      {!isReadOnly && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setCreateMode('ai'); setCreateOpen(true); }}>
            <Sparkles className="h-3.5 w-3.5" /> Gerar com IA
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setCreateMode('manual'); setCreateOpen(true); }}>
            <PenLine className="h-3.5 w-3.5" /> Criar questão
          </Button>
        </div>
      )}

      {/* Study button */}
      {filteredQuestions.length > 0 && (
        <Button onClick={() => setPracticing(true)} className="w-full gap-2 h-12 text-base font-semibold" variant="default">
          <PlayCircle className="h-5 w-5" />
          {filter === 'errors' ? `Revisar Erros (${filteredQuestions.length})` : `Estudar Questões (${filteredQuestions.length})`}
        </Button>
      )}

      {/* Question list */}
      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-foreground">
            {filter === 'errors' ? 'Caderno de Erros' : filter === 'unanswered' ? 'Não Respondidas' : 'Banco de Questões'}
          </h3>
          <Badge variant="secondary">{filteredQuestions.length}</Badge>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando questões...</div>
        ) : filteredQuestions.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {filter === 'errors' ? 'Nenhuma questão no caderno de erros 🎉' : filter === 'unanswered' ? 'Todas as questões foram respondidas!' : 'Nenhuma questão criada para este deck ainda.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredQuestions.map((q, idx) => {
              const opts: string[] = q.options;
              const cIdx = q.correct_indices?.[0] ?? 0;
              const plainText = q.question_text.replace(/<[^>]+>/g, '');
              const isError = statsData.errorQuestionIds.has(q.id);
              const isAnswered = statsData.answeredQuestionIds.has(q.id);
              const isCorrectlyAnswered = isAnswered && !isError;
              return (
                <div key={q.id} className={`rounded-xl border px-3 py-2.5 hover:border-primary/30 transition-colors ${
                  isError ? 'border-destructive/30 bg-destructive/5' : isCorrectlyAnswered ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/50 bg-background'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isError && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
                        {isCorrectlyAnswered && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                        <p className="text-sm font-semibold text-foreground line-clamp-2">
                          {idx + 1}. {plainText}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {opts.slice(0, 5).map((opt, oi) => (
                          <span key={oi} className={`text-[10px] px-1.5 py-0.5 rounded ${
                            oi === cIdx ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold' : 'bg-muted text-muted-foreground'
                          }`}>
                            {LETTERS[oi]}: {opt.length > 25 ? opt.slice(0, 25) + '…' : opt}
                          </span>
                        ))}
                      </div>
                      {/* Concept chips */}
                      {q.concepts && q.concepts.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {q.concepts.map(c => (
                            <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!isReadOnly && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(q.id)}>
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
        <CreateQuestionDialog open={createOpen} onOpenChange={setCreateOpen} deckId={deckId} mode={createMode} />
      )}
    </div>
  );
};

export default DeckQuestionsTab;
