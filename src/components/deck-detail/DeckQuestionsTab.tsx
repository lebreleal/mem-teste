/**
 * DeckQuestionsTab — standalone question bank for a deck.
 * Features: stats bar, error notebook, concept mastery, AI hints/explanations,
 * option elimination (scissors), AI concept card generation.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { renderClozePreview } from '@/components/deck-detail/CardPreviewSheet';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { supabase } from '@/integrations/supabase/client';
import { linkQuestionsToConcepts, ensureGlobalConcepts, updateConceptMastery, conceptSlug } from '@/services/globalConceptService';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  PenLine, Sparkles, Brain, Trash2, PlayCircle, Plus, X, Check,
  ChevronRight, AlertCircle, Scissors, Lightbulb, MessageSquareText, Loader2,
  BookX, Zap, Crown, Search, Filter, CheckCheck, MoreVertical, Eye, ArrowUpRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { shortDisplayId } from '@/lib/shortId';
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

type QuestionFilter = 'all' | 'unanswered' | 'errors' | 'correct';

/* ════════════════════════════════════════════════════════════
   Concept Self-Assessment (after answering)
   3-level confidence scale: strong / learning / weak
   ════════════════════════════════════════════════════════════ */
type MasteryLevel = 'strong' | 'learning' | 'weak';

const ConceptMasterySection = ({
  concepts, deckId, questionId, onGenerateCards, generating,
}: {
  concepts: string[];
  deckId: string;
  questionId: string;
  onGenerateCards: (concept: string) => void;
  generating: string | null;
}) => {
  const [feedback, setFeedback] = useState<Record<string, MasteryLevel>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [conceptExplaining, setConceptExplaining] = useState<string | null>(null);
  const [conceptExplanations, setConceptExplanations] = useState<Record<string, string>>({});
  const [previewCards, setPreviewCards] = useState<Record<string, any[]>>({});
  const [loadingCards, setLoadingCards] = useState<Record<string, boolean>>({});
  const { energy, spendEnergy } = useEnergy();
  const { toast } = useToast();

  if (!concepts || concepts.length === 0) return null;

  const evaluatedCount = Object.keys(feedback).length;
  const strongCount = Object.values(feedback).filter(v => v === 'strong').length;
  const learningCount = Object.values(feedback).filter(v => v === 'learning').length;
  const weakCount = Object.values(feedback).filter(v => v === 'weak').length;

  const handleFeedback = (concept: string, value: MasteryLevel) => {
    setFeedback(prev => ({ ...prev, [concept]: value }));
    if (value === 'strong') {
      setTimeout(() => setExpanded(prev => ({ ...prev, [concept]: false })), 300);
    }
    if (value === 'learning' || value === 'weak') {
      searchExistingCards(concept);
    }
  };

  const toggleExpand = (concept: string) => {
    setExpanded(prev => ({ ...prev, [concept]: !prev[concept] }));
  };

  const searchExistingCards = async (concept: string) => {
    setLoadingCards(prev => ({ ...prev, [concept]: true }));
    try {
      const keywords = concept
        .replace(/^(Você conseguiu|Você entendeu|Você sabe).*?\??\s*/i, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 4);

      if (keywords.length === 0) { setLoadingCards(prev => ({ ...prev, [concept]: false })); return; }

      // Search across all user's decks (not just parent) to find related cards in sub-decks
      const { data: userDecks } = await supabase
        .from('decks')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');
      const userDeckIds = (userDecks ?? []).map(d => d.id);
      
      const { data } = await supabase
        .from('cards')
        .select('id, front_content, back_content, card_type')
        .in('deck_id', userDeckIds.length > 0 ? userDeckIds : [deckId])
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

  const getBorderColor = (level?: MasteryLevel) => {
    switch (level) {
      case 'strong': return 'border-l-emerald-500';
      case 'learning': return 'border-l-amber-500';
      case 'weak': return 'border-l-destructive';
      default: return 'border-l-muted-foreground/20';
    }
  };

  const getStatusIcon = (level: MasteryLevel) => {
    switch (level) {
      case 'strong': return <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'learning': return <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
      case 'weak': return <X className="h-3.5 w-3.5 text-destructive" />;
    }
  };

  const getStatusLabel = (level: MasteryLevel) => {
    switch (level) {
      case 'strong': return 'Dominado';
      case 'learning': return 'Parcial';
      case 'weak': return 'Não entendido';
    }
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

      {/* Progress bar */}
      {concepts.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              <span className="font-bold text-foreground">{evaluatedCount}</span>/{concepts.length} avaliados
            </span>
            <div className="flex items-center gap-2">
              {strongCount > 0 && (
                <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {strongCount}
                </span>
              )}
              {learningCount > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {learningCount}
                </span>
              )}
              {weakCount > 0 && (
                <span className="flex items-center gap-0.5 text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> {weakCount}
                </span>
              )}
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden flex">
            {strongCount > 0 && (
              <div className="h-full transition-all duration-500" style={{ width: `${(strongCount / concepts.length) * 100}%`, background: 'hsl(142 71% 45%)' }} />
            )}
            {learningCount > 0 && (
              <div className="h-full transition-all duration-500" style={{ width: `${(learningCount / concepts.length) * 100}%`, background: 'hsl(38 92% 50%)' }} />
            )}
            {weakCount > 0 && (
              <div className="h-full transition-all duration-500" style={{ width: `${(weakCount / concepts.length) * 100}%`, background: 'hsl(var(--destructive))' }} />
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {concepts.map((c, i) => {
          const answer = feedback[c];
          const existingCards = previewCards[c] || [];
          const isLoadingConcept = loadingCards[c];
          const explanation = conceptExplanations[c];
          const isEvaluated = !!answer;
          const isExpanded = expanded[c] !== false; // default open

          // Collapsed view for evaluated concepts
          if (isEvaluated && !isExpanded) {
            return (
              <button
                key={i}
                onClick={() => toggleExpand(c)}
                className={`w-full text-left rounded-lg border border-border/40 border-l-[3px] ${getBorderColor(answer)} bg-background/50 px-3 py-2 flex items-center gap-2 hover:bg-accent/30 transition-colors`}
              >
                {getStatusIcon(answer)}
                <span className="text-xs text-foreground flex-1 truncate">{c}</span>
                <span className="text-[10px] text-muted-foreground">{getStatusLabel(answer)}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
            );
          }

          return (
            <div key={i} className={`rounded-lg border border-border/40 border-l-[3px] ${getBorderColor(answer)} bg-background/50 p-3 space-y-2.5 transition-all`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground leading-relaxed flex-1">{c}</p>
                {isEvaluated && (
                  <button onClick={() => toggleExpand(c)} className="text-muted-foreground hover:text-foreground shrink-0 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {!answer ? (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm"
                    className="h-7 px-2.5 text-xs gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => handleFeedback(c, 'strong')}>
                    <Check className="h-3 w-3" /> Dominei
                  </Button>
                  <Button variant="outline" size="sm"
                    className="h-7 px-2.5 text-xs gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    onClick={() => handleFeedback(c, 'learning')}>
                    <AlertCircle className="h-3 w-3" /> Mais ou menos
                  </Button>
                  <Button variant="outline" size="sm"
                    className="h-7 px-2.5 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => handleFeedback(c, 'weak')}>
                    <X className="h-3 w-3" /> Não entendi
                  </Button>
                </div>
              ) : answer === 'strong' ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check className="h-3 w-3" /> Conceito dominado ✓
                </span>
              ) : (
                <div className="space-y-2.5">
                  {answer === 'learning' && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <AlertCircle className="h-3 w-3" /> Revise este conceito para consolidar
                    </span>
                  )}
                  {answer === 'weak' && (
                    <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                      <X className="h-3 w-3" /> Conceito precisa de atenção
                    </span>
                  )}

                  {isLoadingConcept ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando cards relacionados...
                    </div>
                  ) : existingCards.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-primary" />
                        <span><span className="font-bold text-foreground">{existingCards.length}</span> cards relacionados encontrados no seu baralho:</span>
                      </p>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {existingCards.map(card => {
                          const backRaw = (card.back_content || '').trim();
                          const isClozeMetadata = backRaw.startsWith('{') && (backRaw.includes('clozeTarget') || backRaw.includes('"extra":""'));
                          const hasRealBack = backRaw.length > 0 && !isClozeMetadata;

                          return (
                            <div key={card.id} className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
                              <div className={`px-3.5 py-2.5 ${hasRealBack ? 'border-b border-border/30' : ''} bg-muted/20`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                                    {card.card_type === 'cloze' ? 'Cloze' : card.card_type === 'multiple_choice' ? 'MC' : 'Básico'}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">Frente</span>
                                </div>
                                <div className="text-xs text-foreground leading-relaxed line-clamp-3"
                                  dangerouslySetInnerHTML={{ __html: card.card_type === 'cloze' ? sanitizeHtml(renderClozePreview(card.front_content, true)) : sanitizeHtml(card.front_content) }} />
                              </div>
                              {hasRealBack && (
                                <div className="px-3.5 py-2 bg-primary/[0.02]">
                                  <span className="text-[10px] text-muted-foreground">Verso</span>
                                  <div className="text-xs text-foreground leading-relaxed line-clamp-2 mt-0.5"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back_content) }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <PlayCircle className="h-3 w-3" />
                        Revise esses cards na próxima sessão de estudo para reforçar o conceito.
                      </p>
                    </div>
                  ) : (
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
                      className="flex items-center gap-1 text-xs text-primary font-medium underline underline-offset-2 decoration-primary/50 hover:decoration-primary disabled:opacity-50"
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
  const [optionExplanations, setOptionExplanations] = useState<Record<number, string>>({});
  const [optionExplainLoading, setOptionExplainLoading] = useState<number | null>(null);
  const [generatingConcept, setGeneratingConcept] = useState<string | null>(null);
  // Elaborative interrogation (Craik & Lockhart, 1972)
  const [elaborativeText, setElaborativeText] = useState('');
  const [elaborativeSubmitted, setElaborativeSubmitted] = useState(false);


  const q = questions[index];

  const resetForNext = useCallback(() => {
    setSelected(null);
    setConfirmed(false);
    setEliminated(new Set());
    setScissorsMode(false);
    setHintText(null);
    setOptionExplanations({});
    setOptionExplainLoading(null);
    setHintLoading(false);
    setElaborativeText('');
    setElaborativeSubmitted(false);
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

    // Update concept mastery (both legacy deck_concept_mastery and global_concepts)
    if (q.concepts && q.concepts.length > 0) {
      // Ensure global concepts exist and update their mastery
      ensureGlobalConcepts(user.id, q.concepts).then(slugToId => {
        for (const concept of q.concepts) {
          const slug = conceptSlug(concept);
          const conceptId = slugToId.get(slug);
          if (conceptId) {
            updateConceptMastery(conceptId, isCorrect).catch(console.error);
          }
        }
        // Also link this question to global concepts if not already linked
        linkQuestionsToConcepts(user.id, [{ questionId: q.id, conceptNames: q.concepts }]).catch(console.error);
        queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
        queryClient.invalidateQueries({ queryKey: ['global-concepts-due'] });
      }).catch(console.error);

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

  const handleExplainOption = useCallback(async (optIdx: number) => {
    if (!q || !user) return;
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setOptionExplainLoading(optIdx);
    try {
      spendEnergy.mutate(1);
      const isCorrectOpt = q.correct_indices?.includes(optIdx);
      const { data, error } = await supabase.functions.invoke('ai-tutor', {
        body: {
          type: 'explain-option',
          question: q.question_text,
          options: q.options,
          optionIndex: optIdx,
          isCorrect: isCorrectOpt,
          correctIndex: q.correct_indices?.[0] ?? 0,
        },
      });
      if (error) throw error;
      setOptionExplanations(prev => ({ ...prev, [optIdx]: data?.response || 'Explicação indisponível.' }));
    } catch { toast({ title: 'Erro ao explicar alternativa', variant: 'destructive' }); }
    finally { setOptionExplainLoading(null); }
  }, [q, user, energy, spendEnergy, toast]);

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

        <div className="text-sm leading-relaxed text-foreground mb-6" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />

        {/* Options */}
        <div className="space-y-2.5">
          {opts.map((opt, i) => {
            const isEliminated = eliminated.has(i);
            const isSelected = selected === i;
            const isCorrectOpt = i === correctIdx;
            const optExplanation = optionExplanations[i];

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
              <div key={i} className="space-y-0">
                <button
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
                  <span className="text-sm leading-relaxed pt-0.5 flex-1">
                    {opt}
                    {confirmed && !optExplanation && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); handleExplainOption(i); }}
                        className="ml-2 text-xs font-medium cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                        style={{ color: isCorrectOpt ? 'hsl(142, 71%, 45%)' : 'hsl(var(--destructive))' }}
                      >
                        {optionExplainLoading === i && <Loader2 className="h-3 w-3 animate-spin inline" />}
                        {isCorrectOpt ? 'Por que está correta?' : 'Por que está errada?'}
                      </span>
                    )}
                  </span>
                  {scissorsMode && !confirmed && <Scissors className="h-4 w-4 text-destructive/60 shrink-0 mt-1" />}
                </button>

                {/* Inline explanation for this option */}
                {optExplanation && (
                  <div className={`ml-10 mt-1.5 mb-1 rounded-lg border p-3 ${
                    isCorrectOpt
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-destructive/20 bg-destructive/5'
                  }`}>
                    <div className="text-xs text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{optExplanation}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
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

        {/* Elaborative Interrogation — shown after wrong answer, before explanation */}
        {confirmed && !wasCorrect && !elaborativeSubmitted && (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2.5">
            <p className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" /> Interrogação Elaborativa
            </p>
            <p className="text-[11px] text-muted-foreground">
              Antes de ver a explicação: por que você acha que a alternativa <span className="font-bold text-foreground">{LETTERS[correctIdx]}</span> está correta?
            </p>
            <Textarea
              value={elaborativeText}
              onChange={(e) => setElaborativeText(e.target.value)}
              placeholder="Escreva sua hipótese (isso ativa processamento profundo)..."
              className="min-h-[60px] text-sm"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setElaborativeSubmitted(true)}>
                <Check className="h-3.5 w-3.5" /> Ver explicação
              </Button>
              <button
                onClick={() => setElaborativeSubmitted(true)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Pular
              </button>
            </div>
          </div>
        )}

        {/* Explanation — shown after correct OR after elaborative submitted */}
        {confirmed && q.explanation && (wasCorrect || elaborativeSubmitted) && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-bold text-primary mb-1.5">Explicação</p>
            <div className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{q.explanation}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Concept Mastery (after confirming, if question has concepts) */}
        {confirmed && (wasCorrect || elaborativeSubmitted) && q.concepts && q.concepts.length > 0 && (
          <ConceptMasterySection
            concepts={q.concepts}
            deckId={deckId}
            questionId={q.id}
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
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleHint} disabled={hintLoading || !!hintText}>
                {hintLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
                Dica <span className="text-[10px] text-muted-foreground font-normal ml-0.5">(1 crédito)</span>
              </Button>
            </div>
            <Button onClick={handleConfirm} disabled={selected === null} className="w-full gap-1.5">
              <Check className="h-4 w-4" /> Confirmar Resposta
            </Button>
          </>
        ) : (
          <Button onClick={handleNext} disabled={!wasCorrect && !elaborativeSubmitted} className="w-full gap-1.5">
            {index >= questions.length - 1 ? 'Ver Resultado' : 'Próxima'} <ChevronRight className="h-4 w-4" />
          </Button>
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

        const questionConceptPairs: { questionId: string; conceptNames: string[]; prerequisites?: string[]; category?: string; subcategory?: string }[] = [];

        for (const qi of qs) {
          // Shuffle options so correct answer isn't always in the same position
          const opts = qi.options || [];
          const correctIdx = qi.correct_index ?? 0;
          const indices = opts.map((_: any, i: number) => i);
          // Fisher-Yates shuffle
          for (let j = indices.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [indices[j], indices[k]] = [indices[k], indices[j]];
          }
          const shuffledOpts = indices.map((i: number) => opts[i]);
          const newCorrectIdx = indices.indexOf(correctIdx);

          const { data: inserted } = await supabase.from('deck_questions' as any).insert({
            deck_id: deckId, created_by: user.id,
            question_text: qi.question_text || '',
            question_type: 'multiple_choice',
            options: shuffledOpts,
            correct_indices: [newCorrectIdx],
            explanation: qi.explanation || '',
            concepts: qi.concepts || [],
          }).select('id').single();

          // Collect for global concept linking
          if (inserted && qi.concepts?.length > 0) {
            questionConceptPairs.push({
              questionId: (inserted as any).id,
              conceptNames: qi.concepts,
              prerequisites: qi.prerequisites ?? [],
              category: qi.category ?? undefined,
              subcategory: qi.subcategory ?? undefined,
            });
          }
        }

        // Link all questions to global concepts (fire-and-forget)
        if (questionConceptPairs.length > 0) {
          linkQuestionsToConcepts(user.id, questionConceptPairs).catch(console.error);
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
  deckId, isReadOnly = false, sourceDeckId, autoStart, autoCreate, conceptFilter,
}: {
  deckId: string; isReadOnly?: boolean; sourceDeckId?: string | null;
  autoStart?: boolean; autoCreate?: 'ai' | 'manual' | null; conceptFilter?: string | string[];
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(!!autoCreate);
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>(autoCreate === 'manual' ? 'manual' : 'ai');
  const [practicing, setPracticing] = useState(!!autoStart);

  // Sync autoStart/autoCreate prop changes (component may already be mounted)
  useEffect(() => {
    if (autoStart) setPracticing(true);
  }, [autoStart]);

  useEffect(() => {
    if (autoCreate) {
      setCreateOpen(true);
      setCreateMode(autoCreate === 'manual' ? 'manual' : 'ai');
    }
  }, [autoCreate]);
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [previewQuestion, setPreviewQuestion] = useState<DeckQuestion | null>(null);
  const [editQuestion, setEditQuestion] = useState<DeckQuestion | null>(null);
  const [communityWarningOpen, setCommunityWarningOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const effectiveDeckId = sourceDeckId || deckId;

  // Check if deck is linked to community
  const isLinkedDeck = useMemo(() => {
    // If sourceDeckId is provided and different from deckId, it's a linked deck
    return !!sourceDeckId && sourceDeckId !== deckId;
  }, [sourceDeckId, deckId]);

  // Fetch all deck IDs in hierarchy (this deck + all descendants)
  const { data: hierarchyDeckIds = [effectiveDeckId] } = useQuery({
    queryKey: ['deck-hierarchy-ids', effectiveDeckId],
    queryFn: async () => {
      // BFS to collect all descendant deck IDs
      const allIds: string[] = [effectiveDeckId];
      let frontier = [effectiveDeckId];
      while (frontier.length > 0) {
        const { data: children } = await supabase
          .from('decks')
          .select('id')
          .in('parent_deck_id', frontier);
        if (!children || children.length === 0) break;
        const childIds = children.map((d: any) => d.id);
        allIds.push(...childIds);
        frontier = childIds;
      }
      return allIds;
    },
    enabled: !!effectiveDeckId,
    staleTime: 120_000,
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['deck-questions', effectiveDeckId, hierarchyDeckIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deck_questions' as any).select('*')
        .in('deck_id', hierarchyDeckIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((q: any) => {
        let opts: string[] = [];
        if (Array.isArray(q.options)) {
          opts = q.options.map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || JSON.stringify(o)));
        } else if (typeof q.options === 'string') {
          try { const parsed = JSON.parse(q.options); if (Array.isArray(parsed)) opts = parsed.map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || JSON.stringify(o))); } catch {}
        } else if (q.options && typeof q.options === 'object') {
          const values = Object.values(q.options);
          if (values.length > 0) opts = values.map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || JSON.stringify(o)));
        }
        return {
          ...q,
          options: opts,
          concepts: Array.isArray(q.concepts) ? q.concepts : [],
        };
      }) as DeckQuestion[];
    },
    enabled: !!effectiveDeckId && hierarchyDeckIds.length > 0,
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

  // Filter + search questions
  const filteredQuestions = useMemo(() => {
    let filtered = questions;
    // Apply concept filter from Concepts tab (single string or array for interleaving)
    if (conceptFilter) {
      if (Array.isArray(conceptFilter)) {
        const cfSet = new Set(conceptFilter.map(c => c.toLocaleLowerCase('pt-BR')));
        filtered = filtered.filter(q =>
          (q.concepts ?? []).some(c => cfSet.has(c.toLocaleLowerCase('pt-BR')))
        );
        // Shuffle for interleaving (Bjork, 2001)
        filtered = [...filtered].sort(() => Math.random() - 0.5);
      } else {
        const cf = conceptFilter.toLocaleLowerCase('pt-BR');
        filtered = filtered.filter(q =>
          (q.concepts ?? []).some(c => c.toLocaleLowerCase('pt-BR') === cf)
        );
      }
    }
    if (filter === 'unanswered') filtered = filtered.filter(q => !statsData.answeredQuestionIds.has(q.id));
    if (filter === 'errors') filtered = filtered.filter(q => statsData.errorQuestionIds.has(q.id));
    if (filter === 'correct') filtered = filtered.filter(q => statsData.answeredQuestionIds.has(q.id) && !statsData.errorQuestionIds.has(q.id));
    if (searchQuery.trim()) {
      const lq = searchQuery.toLowerCase();
      filtered = filtered.filter(q => {
        const plain = (q.question_text ?? '').replace(/<[^>]+>/g, '').toLowerCase();
        const optsText = (q.options ?? []).join(' ').toLowerCase();
        const conceptsText = (q.concepts ?? []).join(' ').toLowerCase();
        return plain.includes(lq) || optsText.includes(lq) || conceptsText.includes(lq);
      });
    }
    return filtered;
  }, [questions, filter, statsData, searchQuery, conceptFilter]);

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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await supabase.from('deck_questions' as any).delete().eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', effectiveDeckId] });
      setSelectedQuestions(new Set());
      setSelectionMode(false);
      toast({ title: `${selectedQuestions.size} questões removidas` });
    },
  });

  const toggleSelection = (id: string) => {
    setSelectedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Only treat as community content if the deck itself is linked to a community source
  const isCommunityQuestion = (_q: DeckQuestion) => {
    return isLinkedDeck;
  };

  if (practicing && filteredQuestions.length > 0) {
    return <QuestionPractice questions={filteredQuestions} deckId={deckId} onClose={() => setPracticing(false)} />;
  }

  const correctPct = statsData.total > 0 ? (statsData.correct / statsData.total) * 100 : 0;
  const wrongPct = statsData.total > 0 ? (statsData.wrong / statsData.total) * 100 : 0;
  const hasActiveFilter = filter !== 'all';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base sm:text-lg font-bold text-foreground shrink-0">
          Banco de Questões ({filteredQuestions.length})
        </h2>
        <div className="flex items-center gap-2">
          {questions.length > 0 && (
            <>
              <Button
                variant={hasActiveFilter ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 relative"
                onClick={() => setShowFilters(!showFilters)}
                title="Filtrar"
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilter && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </Button>
              <Button
                variant={selectionMode ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => { setSelectionMode(!selectionMode); setSelectedQuestions(new Set()); }}
                title={selectionMode ? 'Cancelar seleção' : 'Selecionar'}
              >
                {selectionMode ? <X className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
              </Button>
            </>
          )}
          {!selectionMode && !isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 gap-1.5 px-3 text-xs" title="Adicionar">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Adicionar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setCreateMode('manual'); setCreateOpen(true); }}>
                  <PenLine className="mr-2 h-4 w-4" /> Criar manualmente
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setCreateMode('ai'); setCreateOpen(true); }}>
                  <Sparkles className="mr-2 h-4 w-4" /> Gerar com IA
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPasteOpen(true)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" /> Colar questões
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Selection action bar */}
      {selectionMode && selectedQuestions.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selectedQuestions.size} selecionada{selectedQuestions.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setSelectedQuestions(new Set())}>
              <CheckCheck className="h-3.5 w-3.5" /> Desmarcar
            </Button>
            {!isReadOnly && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-destructive hover:text-destructive"
                onClick={() => {
                  if (selectedQuestions.size > 0) bulkDeleteMutation.mutate([...selectedQuestions]);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {statsData.total > 0 && !selectionMode && (
        <div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="transition-all" style={{ width: `${correctPct}%`, backgroundColor: 'hsl(142 71% 45%)' }} />
            <div className="transition-all bg-destructive" style={{ width: `${wrongPct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> <strong className="text-foreground">{statsData.total - statsData.answered}</strong> A responder
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(142 71% 45%)' }} /> <strong className="text-foreground">{statsData.correct}</strong> Corretas
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" /> <strong className="text-foreground">{statsData.wrong}</strong> Erradas
            </span>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      {questions.length > 0 && (
        <div className="space-y-2">
          {questions.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Pesquisar questões..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
          )}

          {showFilters && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: 'all' as const, label: 'Todas', count: statsData.total },
                    { key: 'unanswered' as const, label: 'A responder', count: statsData.total - statsData.answered },
                    { key: 'correct' as const, label: 'Corretas', count: statsData.correct },
                    { key: 'errors' as const, label: 'Erradas', count: statsData.wrong },
                  ]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        filter === f.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-accent border border-border/50'
                      }`}
                    >
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilter && (
                <button onClick={() => setFilter('all')} className="text-xs text-primary hover:underline">
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Question list */}
      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Carregando questões...</div>
      ) : filteredQuestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <h3 className="font-display text-lg font-semibold text-foreground">
            {hasActiveFilter || searchQuery ? 'Nenhuma questão encontrada' : 'Nenhuma questão ainda'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilter || searchQuery ? 'Tente ajustar os filtros ou busca.' : 'Adicione questões para praticar.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredQuestions.map((q, idx) => {
            const opts: string[] = q.options ?? [];
            const cIdx = q.correct_indices?.[0] ?? 0;
            const plainText = (q.question_text ?? '').replace(/<[^>]+>/g, '').trim();
            const isError = statsData.errorQuestionIds.has(q.id);
            const isAnswered = statsData.answeredQuestionIds.has(q.id);
            const isCorrectlyAnswered = isAnswered && !isError;
            const isSelected = selectedQuestions.has(q.id);
            const isCommunity = isCommunityQuestion(q);
            const conceptCount = q.concepts?.length ?? 0;

            const borderClass = isError
              ? 'border-destructive/40'
              : isCorrectlyAnswered
              ? 'border-emerald-500/40'
              : 'border-border/60';

            return (
              <div
                key={q.id}
                className={`group rounded-xl border bg-card p-4 transition-colors cursor-pointer ${
                  isSelected ? 'border-primary/50 bg-primary/5' : `${borderClass} hover:border-border hover:shadow-sm`
                }`}
                onClick={() => {
                  if (selectionMode) {
                    if (isCommunity) {
                      setCommunityWarningOpen(true);
                      return;
                    }
                    toggleSelection(q.id);
                    return;
                  }
                  setPreviewQuestion(q);
                }}
              >
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCommunity) { setCommunityWarningOpen(true); return; }
                        toggleSelection(q.id);
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        className={isCommunity ? 'opacity-40 cursor-not-allowed' : ''}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Concept count badge */}
                    {conceptCount > 0 && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <Brain className="h-2.5 w-2.5" /> {conceptCount} conceito{conceptCount > 1 ? 's' : ''}
                        </span>
                      </div>
                    )}

                    {/* Question text */}
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      <span className="text-[10px] font-mono text-muted-foreground/60 mr-1.5">{shortDisplayId(q.id)}</span>
                      {idx + 1}. {plainText || '(Sem enunciado)'}
                    </p>

                    {/* Options preview - MC style */}
                    {opts.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {opts.slice(0, 5).map((opt, oi) => (
                          <p key={oi} className={`text-xs leading-snug ${
                            oi === cIdx ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'
                          }`}>
                            {oi === cIdx ? '✓ ' : '  '}{LETTERS[oi]}. {opt.length > 60 ? opt.slice(0, 60) + '…' : opt}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right side: 3-dot menu only */}
                  {!selectionMode && (
                    <div className="flex items-center shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e: any) => e.stopPropagation()}>
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[140px]">
                          <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); setPreviewQuestion(q); }}>
                            <Eye className="mr-2 h-4 w-4" /> Ver
                          </DropdownMenuItem>
                          {!isReadOnly && !isCommunity && (
                            <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); setEditQuestion(q); }}>
                              <PenLine className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          )}
                          {!isReadOnly && !isCommunity && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e: any) => { e.stopPropagation(); deleteMutation.mutate(q.id); }}>
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Question Preview Dialog */}
      <Dialog open={!!previewQuestion} onOpenChange={(v) => { if (!v) setPreviewQuestion(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização</DialogTitle>
          </DialogHeader>
          {previewQuestion && (() => {
            const opts = previewQuestion.options ?? [];
            const cIdx = previewQuestion.correct_indices?.[0] ?? 0;
            return (
              <div className="space-y-4">
                <div className="text-sm leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewQuestion.question_text) }} />
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
                {previewQuestion.explanation && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-bold text-primary mb-1">Explicação</p>
                    <div className="text-xs text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewQuestion.explanation) }} />
                  </div>
                )}
                {previewQuestion.concepts && previewQuestion.concepts.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {previewQuestion.concepts.map(c => (
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Question Dialog */}
      {editQuestion && !isReadOnly && (
        <EditQuestionDialog
          question={editQuestion}
          open={!!editQuestion}
          onOpenChange={(v) => { if (!v) setEditQuestion(null); }}
          deckId={deckId}
          effectiveDeckId={effectiveDeckId}
        />
      )}

      {/* Community warning dialog */}
      <Dialog open={communityWarningOpen} onOpenChange={setCommunityWarningOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conteúdo da comunidade</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Questões vindas da comunidade não podem ser selecionadas para mover ou excluir.
            Apenas questões criadas por você podem ser gerenciadas.
          </p>
          <DialogFooter>
            <Button onClick={() => setCommunityWarningOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isReadOnly && (
        <>
          <CreateQuestionDialog open={createOpen} onOpenChange={setCreateOpen} deckId={deckId} mode={createMode} />
          <PasteQuestionsDialog open={pasteOpen} onOpenChange={setPasteOpen} deckId={deckId} />
        </>
      )}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   Paste Questions Dialog — parse pasted text via AI
   ════════════════════════════════════════════════════════════ */
const PasteQuestionsDialog = ({
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
      const { data: existingConcepts } = await supabase
        .from('global_concepts' as any)
        .select('name')
        .eq('user_id', user.id)
        .limit(200);

      const conceptNames = (existingConcepts ?? []).map((c: any) => c.name);

      const { data, error } = await supabase.functions.invoke('parse-questions', {
        body: { text: pastedText, aiModel, existingConcepts: conceptNames },
      });
      if (error) throw error;
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
      const questionConceptPairs: { questionId: string; conceptNames: string[]; prerequisites?: string[]; category?: string; subcategory?: string }[] = [];

      for (const q of toSave) {
        const { data: inserted } = await supabase.from('deck_questions' as any).insert({
          deck_id: deckId,
          created_by: user.id,
          question_text: q.question_text,
          question_type: 'multiple_choice',
          options: q.options,
          correct_indices: q.correct_index >= 0 ? [q.correct_index] : [],
          explanation: q.explanation || '',
          concepts: q.concepts || [],
        }).select('id').single();

        if (inserted && q.concepts?.length > 0) {
          questionConceptPairs.push({
            questionId: (inserted as any).id,
            conceptNames: q.concepts,
            category: (q as any).category ?? undefined,
            subcategory: (q as any).subcategory ?? undefined,
          });
        }
      }

      if (questionConceptPairs.length > 0) {
        linkQuestionsToConcepts(user.id, questionConceptPairs).catch(console.error);
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
   Edit Question Dialog
   ════════════════════════════════════════════════════════════ */
const EditQuestionDialog = ({
  question, open, onOpenChange, deckId, effectiveDeckId,
}: {
  question: DeckQuestion; open: boolean; onOpenChange: (v: boolean) => void; deckId: string; effectiveDeckId: string;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [questionText, setQuestionText] = useState(question.question_text);
  const [options, setOptions] = useState<string[]>(question.options.length > 0 ? [...question.options] : ['', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState<number | null>(question.correct_indices?.[0] ?? null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const validOptions = options.filter(o => o.trim());
      if (validOptions.length < 2) throw new Error('Mínimo 2 alternativas');
      if (!questionText.trim()) throw new Error('Enunciado obrigatório');
      if (correctIdx === null) throw new Error('Marque a alternativa correta');

      const { error } = await supabase.from('deck_questions' as any).update({
        question_text: questionText.trim(),
        options: validOptions,
        correct_indices: [correctIdx],
      }).eq('id', question.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-questions', effectiveDeckId] });
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
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Enunciado</label>
            <Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Digite o enunciado..." className="min-h-[80px]" />
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
                </div>
              ))}
            </div>
          </div>
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

export default DeckQuestionsTab;
