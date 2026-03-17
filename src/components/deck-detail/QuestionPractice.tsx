/**
 * QuestionPractice — Full-screen question practice mode.
 * Includes ConceptMasterySection (self-assessment after answering).
 * Extracted per Lei 2B from DeckQuestionsTab.tsx (copy-paste integral).
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useEnergy } from '@/hooks/useEnergy';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHtml } from '@/lib/sanitize';
import { renderClozePreview } from '@/components/deck-detail/CardPreviewSheet';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Check, X, ChevronRight, AlertCircle, Scissors, Lightbulb,
  MessageSquareText, Loader2, Brain, Zap, PlayCircle,
  Sparkles,
} from 'lucide-react';
import {
  getCurrentUserId, fetchQuestionConceptDescriptions,
  searchCardsForConcept, resolveConceptNamesFromLinks,
  saveQuestionAttempt, insertConceptCards, invokeAITutor,
} from '@/services/deckQuestionService';
import { moveConceptCardsToErrorDeck } from '@/services/errorDeckService';
import { upsertQuestionIntoErrorDeck } from '@/services/errorQuestionCardService';
import { ensureGlobalConcepts, updateConceptMastery, conceptSlug, linkQuestionsToConcepts } from '@/services/globalConceptService';
import type { DeckQuestion, MasteryLevel } from '@/components/deck-detail/question-types';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/* ════════════════════════════════════════════════════════════
   Concept Self-Assessment (after answering)
   3-level confidence scale: strong / learning / weak
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
  const [feedback, setFeedback] = useState<Record<string, MasteryLevel>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [conceptExplaining, setConceptExplaining] = useState<string | null>(null);
  const [conceptExplanations, setConceptExplanations] = useState<Record<string, string>>({});
  const [previewCards, setPreviewCards] = useState<Record<string, any[]>>({});
  const [loadingCards, setLoadingCards] = useState<Record<string, boolean>>({});
  const [conceptDescriptions, setConceptDescriptions] = useState<Record<string, string>>({});
  const { energy, spendEnergy } = useEnergy();
  const { toast } = useToast();
  const { decks } = useDecks();

  const deckScopeIds = useMemo(() => {
    if (!decks || decks.length === 0) return [deckId];
    const result = new Set<string>([deckId]);
    const queue = [deckId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = decks.filter(d => d.parent_deck_id === current && !d.is_archived);
      for (const child of children) {
        if (!result.has(child.id)) {
          result.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return [...result];
  }, [decks, deckId]);

  // Fetch context descriptions from question_concepts (how each concept relates to THIS question)
  useEffect(() => {
    if (!concepts || concepts.length === 0 || !questionId) return;
    (async () => {
      const userId = await getCurrentUserId();
      if (!userId) return;
      const result = await fetchQuestionConceptDescriptions(questionId);
      if (!result || !result.descMap) return;

      const descMap: Record<string, string> = { ...result.descMap };
      // Also map by original concept name match
      for (const gc of result.gcData ?? []) {
        const matchedConcept = concepts.find(c => c.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === gc.slug);
        if (matchedConcept && result.descMap[gc.name]) descMap[matchedConcept] = result.descMap[gc.name];
      }
      setConceptDescriptions(descMap);
    })();
  }, [concepts, questionId]);

  if (!concepts || concepts.length === 0) return null;

  const queryClient = useQueryClient();
  const evaluatedCount = Object.keys(feedback).length;
  const strongCount = Object.values(feedback).filter(v => v === 'strong').length;
  const learningCount = Object.values(feedback).filter(v => v === 'learning').length;
  const weakCount = Object.values(feedback).filter(v => v === 'weak').length;

  const searchExistingCards = async (concept: string): Promise<any[]> => {
    setLoadingCards(prev => ({ ...prev, [concept]: true }));
    try {
      const cards = await searchCardsForConcept(deckScopeIds, concept);
      setPreviewCards(prev => ({ ...prev, [concept]: cards }));
      return cards;
    } catch {
      return [];
    } finally {
      setLoadingCards(prev => ({ ...prev, [concept]: false }));
    }
  };

  const handleFeedback = (concept: string, value: MasteryLevel) => {
    setFeedback(prev => ({ ...prev, [concept]: value }));

    if (value === 'strong') {
      setTimeout(() => setExpanded(prev => ({ ...prev, [concept]: false })), 300);
      return;
    }

    void (async () => {
      await searchExistingCards(concept);

      const userId = await getCurrentUserId();
      if (!userId) return;

      try {
        const moved = await moveConceptCardsToErrorDeck(userId, [concept], deckId);
        if (moved > 0) {
          queryClient.invalidateQueries({ queryKey: ['error-deck-cards'] });
          queryClient.invalidateQueries({ queryKey: ['error-notebook-count'] });
          queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
        }
      } catch {
        // keep self-assessment usable even if movement fails
      }
    })();
  };

  const toggleExpand = (concept: string) => {
    setExpanded(prev => ({ ...prev, [concept]: !prev[concept] }));
  };

  const handleExplainConcept = async (concept: string) => {
    if (energy < 1) { toast({ title: 'Créditos insuficientes', variant: 'destructive' }); return; }
    setConceptExplaining(concept);
    try {
      spendEnergy.mutate(1);
      const data = await invokeAITutor({ type: 'explain-concept', concept, deckId });
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
              <div className="h-full transition-all duration-500" style={{ width: `${(strongCount / concepts.length) * 100}%`, background: 'hsl(var(--success))' }} />
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-relaxed">{c}</p>
                  {conceptDescriptions[c] && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      {conceptDescriptions[c]}
                    </p>
                  )}
                </div>
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
    await saveQuestionAttempt(q.id, user.id, [selected], isCorrect);

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

    // Move concept-related cards to error deck when wrong
    if (!isCorrect) {
      void (async () => {
        let conceptsToUse = q.concepts ?? [];

        // Fallback: if question has no inline concepts, resolve from question_concepts
        if (conceptsToUse.length === 0) {
          conceptsToUse = await resolveConceptNamesFromLinks(q.id);
        }

        const moved = conceptsToUse.length > 0
          ? await moveConceptCardsToErrorDeck(user.id, conceptsToUse, q.deck_id || deckId)
          : 0;

        const fallback = moved === 0
          ? await upsertQuestionIntoErrorDeck(user.id, {
            questionId: q.id,
            questionText: q.question_text,
            correctAnswer: q.correct_answer,
            correctIndices: q.correct_indices,
            options: q.options,
            explanation: q.explanation,
            originDeckId: q.deck_id || deckId,
          })
          : 'exists';

        if (moved > 0 || fallback === 'created' || fallback === 'moved') {
          queryClient.invalidateQueries({ queryKey: ['error-deck-cards'] });
          queryClient.invalidateQueries({ queryKey: ['error-notebook-count'] });
          queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
        }
      })().catch(console.error);
    }

    queryClient.invalidateQueries({ queryKey: ['question-attempts', deckId] });
  }, [selected, q, user, deckId, queryClient]);

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
      const data = await invokeAITutor({ type: 'question-hint', question: q.question_text, options: q.options, correctIndex: q.correct_indices?.[0] ?? 0 });
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
      const data = await invokeAITutor({
        type: 'explain-option',
        question: q.question_text,
        options: q.options,
        optionIndex: optIdx,
        isCorrect: isCorrectOpt,
        correctIndex: q.correct_indices?.[0] ?? 0,
      });
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
      const data = await invokeAITutor({ type: 'generate-concept-cards', concept, deckId, energyCost: 0 });
      const cards = data?.cards || [];
      if (cards.length > 0) {
        await insertConceptCards(deckId, cards);
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
                background: pct >= 70 ? 'hsl(var(--success))' : pct >= 40 ? 'hsl(40 90% 60%)' : 'hsl(var(--destructive))',
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

export default QuestionPractice;
