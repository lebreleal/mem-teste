/**
 * ErrorNotebook — Hierarchical "Caderno de Erros" page.
 * Transforms errors into a full diagnostic of the knowledge tree.
 * Shows concept hierarchy, identifies weak foundations, triggers cascade generation.
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
export interface ConceptNode {
  id: string;
  name: string;
  slug: string;
  state: number;
  stability: number;
  difficulty: number;
  correct_count: number;
  wrong_count: number;
  parent_concept_id: string | null;
  isErrorSource: boolean;
  health: 'weak' | 'learning' | 'strong';
  questionCount: number;
  depth: number;
}

export interface HierarchyDiagnostic {
  errorQuestionId: string;
  errorQuestionText: string;
  sourceConcepts: ConceptNode[];
  weakFoundations: ConceptNode[];
  allConcepts: ConceptNode[];
  conceptPath: { id: string; name: string }[];
}

interface ErrorQuestion {
  id: string;
  deck_id: string;
  question_text: string;
  options: string[];
  correct_indices: number[] | null;
  explanation: string;
  concepts: string[];
  deck_name: string;
  linkedConcepts: { id: string; name: string; state: number; stability: number }[];
  relatedCardCount: number;
}

const STATE_LABELS: Record<number, string> = { 0: 'Novo', 1: 'Aprendendo', 2: 'Dominado', 3: 'Reaprendendo' };
const HEALTH_CONFIG = {
  weak: { label: 'Fraco', icon: AlertTriangle, class: 'bg-destructive/15 text-destructive border-destructive/30' },
  learning: { label: 'Aprendendo', icon: BrainCircuit, class: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  strong: { label: 'Dominado', icon: Shield, class: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
};

// ─── Concept Node Card ───
const ConceptNodeCard = ({
  node,
  isSource = false,
  onCascade,
  isCascading = false,
}: {
  node: ConceptNode;
  isSource?: boolean;
  onCascade: (node: ConceptNode) => void;
  isCascading?: boolean;
}) => {
  const config = HEALTH_CONFIG[node.health];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border px-3 py-2.5 space-y-1.5 transition-all ${config.class} ${isSource ? 'ring-2 ring-destructive/30' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold truncate">{node.name}</span>
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0 border-current/30">
          {config.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-[10px] opacity-70">
        <span className="flex items-center gap-0.5">
          <Layers className="h-2.5 w-2.5" />
          {node.cardCount} cards
        </span>
        <span className="flex items-center gap-0.5">
          <Target className="h-2.5 w-2.5" />
          {node.questionCount} questões
        </span>
        <span>{node.deckName}</span>
      </div>

      {/* Accuracy bar */}
      {(node.correct_count + node.wrong_count) > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-background/50 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((node.correct_count / (node.correct_count + node.wrong_count)) * 100)}%`,
                background: 'hsl(var(--primary))',
              }}
            />
          </div>
          <span className="text-[9px] tabular-nums opacity-60">
            {node.correct_count}✓ {node.wrong_count}✗
          </span>
        </div>
      )}

      {/* Cascade action for weak nodes */}
      {node.health === 'weak' && !isSource && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-[10px] h-7 mt-1 border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => onCascade(node)}
          disabled={isCascading}
        >
          {isCascading ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Gerando conteúdo...</>
          ) : (
            <><Zap className="h-3 w-3" /> Preencher lacuna com cards + questões</>
          )}
        </Button>
      )}
    </div>
  );
};

// ─── Hierarchy Tree View ───
const HierarchyTreeView = ({
  diagnostic,
  onCascade,
  cascadingNodeId,
}: {
  diagnostic: HierarchyDiagnostic;
  onCascade: (node: ConceptNode) => void;
  cascadingNodeId: string | null;
}) => {
  const { sourceConcept, weakFoundations, allConcepts, deckPath } = diagnostic;

  return (
    <div className="space-y-4">
      {/* Deck path breadcrumb */}
      {deckPath.length > 1 && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground overflow-x-auto pb-1">
          <GitBranch className="h-3 w-3 shrink-0" />
          {deckPath.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1 whitespace-nowrap">
              {i > 0 && <ChevronRight className="h-2.5 w-2.5" />}
              <span className={i === deckPath.length - 1 ? 'font-semibold text-foreground' : ''}>{d.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Source concept (the error) */}
      {sourceConcept && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Conceito do Erro
          </p>
          <ConceptNodeCard
            node={sourceConcept}
            isSource
            onCascade={onCascade}
            isCascading={cascadingNodeId === sourceConcept.id}
          />
        </div>
      )}

      {/* Weak foundations */}
      {weakFoundations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Lacunas Fundacionais ({weakFoundations.length})
          </p>
          <p className="text-[10px] text-muted-foreground">
            Conceitos da hierarquia abaixo do erro com FSRS fraco — preencha para corrigir a base.
          </p>
          <div className="space-y-2 pl-3 border-l-2 border-amber-500/30">
            {weakFoundations.map(node => (
              <ConceptNodeCard
                key={node.id}
                node={node}
                onCascade={onCascade}
                isCascading={cascadingNodeId === node.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Strong concepts (collapsed) */}
      {allConcepts.filter(c => c.health === 'strong' && !c.isErrorSource).length > 0 && (
        <details className="group">
          <summary className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1 cursor-pointer list-none">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            <Shield className="h-3 w-3" />
            Conceitos Dominados ({allConcepts.filter(c => c.health === 'strong' && !c.isErrorSource).length})
          </summary>
          <div className="space-y-2 mt-1.5 pl-3 border-l-2 border-emerald-500/30">
            {allConcepts.filter(c => c.health === 'strong' && !c.isErrorSource).map(node => (
              <ConceptNodeCard
                key={node.id}
                node={node}
                onCascade={onCascade}
                isCascading={cascadingNodeId === node.id}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

// ─── Main Page ───
const ErrorNotebook = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [diagnosticCache, setDiagnosticCache] = useState<Map<string, HierarchyDiagnostic>>(new Map());
  const [loadingDiagnostic, setLoadingDiagnostic] = useState<string | null>(null);
  const [cascadingNodeId, setCascadingNodeId] = useState<string | null>(null);
  const [drillTarget, setDrillTarget] = useState<{ id: string; name: string; state: number } | null>(null);

  const { data: errorQuestions = [], isLoading } = useQuery({
    queryKey: ['error-notebook', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: attempts } = await supabase
        .from('deck_question_attempts' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('answered_at', { ascending: false });

      if (!attempts || attempts.length === 0) return [];

      const latestByQ = new Map<string, any>();
      for (const a of attempts as any[]) {
        if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a);
      }

      const wrongIds = [...latestByQ.entries()]
        .filter(([_, a]) => !a.is_correct)
        .map(([qId]) => qId);

      if (wrongIds.length === 0) return [];

      const { data: questions } = await supabase
        .from('deck_questions' as any)
        .select('*')
        .in('id', wrongIds);

      if (!questions || questions.length === 0) return [];

      const deckIds = [...new Set((questions as any[]).map((q: any) => q.deck_id))];
      const { data: decks } = await supabase
        .from('decks')
        .select('id, name')
        .in('id', deckIds);
      const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));

      const { data: conceptLinks } = await supabase
        .from('question_concepts' as any)
        .select('question_id, concept_id')
        .in('question_id', wrongIds);

      const conceptIds = [...new Set((conceptLinks ?? []).map((l: any) => l.concept_id))];
      let conceptMap = new Map<string, { id: string; name: string; state: number; stability: number }>();
      if (conceptIds.length > 0) {
        const { data: gc } = await supabase
          .from('global_concepts' as any)
          .select('id, name, state, stability')
          .eq('user_id', user.id)
          .in('id', conceptIds);
        if (gc) {
          for (const c of gc as any[]) {
            conceptMap.set(c.id, { id: c.id, name: c.name, state: c.state, stability: c.stability ?? 0 });
          }
        }
      }

      const qConceptMap = new Map<string, { id: string; name: string; state: number; stability: number }[]>();
      for (const link of (conceptLinks ?? []) as any[]) {
        const concept = conceptMap.get(link.concept_id);
        if (concept) {
          if (!qConceptMap.has(link.question_id)) qConceptMap.set(link.question_id, []);
          qConceptMap.get(link.question_id)!.push(concept);
        }
      }

      const { data: cardCounts } = await supabase
        .from('cards')
        .select('deck_id')
        .in('deck_id', deckIds);

      const cardCountMap = new Map<string, number>();
      for (const c of (cardCounts ?? []) as any[]) {
        cardCountMap.set(c.deck_id, (cardCountMap.get(c.deck_id) ?? 0) + 1);
      }

      return (questions as any[]).map((q: any) => ({
        id: q.id,
        deck_id: q.deck_id,
        question_text: q.question_text,
        options: Array.isArray(q.options) ? q.options : [],
        correct_indices: q.correct_indices,
        explanation: q.explanation || '',
        concepts: Array.isArray(q.concepts) ? q.concepts : [],
        deck_name: deckMap.get(q.deck_id) || 'Baralho',
        linkedConcepts: (qConceptMap.get(q.id) ?? []).sort((a, b) => a.stability - b.stability),
        relatedCardCount: cardCountMap.get(q.deck_id) ?? 0,
      })) as ErrorQuestion[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Group by deck
  const groupedByDeck = useMemo(() => {
    const map = new Map<string, { name: string; questions: ErrorQuestion[] }>();
    for (const q of errorQuestions) {
      if (!map.has(q.deck_id)) map.set(q.deck_id, { name: q.deck_name, questions: [] });
      map.get(q.deck_id)!.questions.push(q);
    }
    return [...map.entries()];
  }, [errorQuestions]);

  // Stats
  const weakConceptCount = useMemo(() => {
    const seen = new Set<string>();
    for (const q of errorQuestions) {
      for (const c of q.linkedConcepts) {
        if (c.state === 0 || c.state === 3) seen.add(c.id);
      }
    }
    return seen.size;
  }, [errorQuestions]);

  // Weakest concept across all errors
  const weakestConcept = useMemo(() => {
    let weakest: { id: string; name: string; state: number; stability: number } | null = null;
    for (const q of errorQuestions) {
      if (q.linkedConcepts.length > 0) {
        const first = q.linkedConcepts[0];
        if (!weakest || first.stability < weakest.stability) weakest = first;
      }
    }
    return weakest;
  }, [errorQuestions]);

  // Load hierarchy diagnostic for a question
  const loadDiagnostic = useCallback(async (questionId: string) => {
    if (!user || diagnosticCache.has(questionId)) {
      setExpandedQuestion(prev => prev === questionId ? null : questionId);
      return;
    }

    setLoadingDiagnostic(questionId);
    setExpandedQuestion(questionId);

    try {
      const result = await buildHierarchyDiagnostic(questionId, user.id);
      if (result) {
        setDiagnosticCache(prev => new Map(prev).set(questionId, result));
      }
    } catch (err) {
      console.error('Diagnostic error:', err);
      toast.error('Erro ao carregar diagnóstico hierárquico.');
    } finally {
      setLoadingDiagnostic(null);
    }
  }, [user, diagnosticCache]);

  // Handle cascade generation
  const handleCascade = useCallback(async (node: ConceptNode) => {
    if (!user || !expandedQuestion) return;
    setCascadingNodeId(node.id);

    try {
      const errorQ = errorQuestions.find(q => q.id === expandedQuestion);
      const result = await generateCascadeContent(
        node.id,
        node.name,
        errorQ?.question_text ?? '',
        user.id,
      );

      if (result) {
        toast.success(
          `Criados ${result.cardsCreated} cards e ${result.questionsCreated} questões para "${node.name}"`,
        );
        queryClient.invalidateQueries({ queryKey: ['error-notebook'] });
        queryClient.invalidateQueries({ queryKey: ['decks'] });
        // Refresh diagnostic cache
        setDiagnosticCache(prev => {
          const next = new Map(prev);
          next.delete(expandedQuestion!);
          return next;
        });
        // Reload diagnostic
        const refreshed = await buildHierarchyDiagnostic(expandedQuestion, user.id);
        if (refreshed) {
          setDiagnosticCache(prev => new Map(prev).set(expandedQuestion!, refreshed));
        }
      } else {
        toast.error('Não foi possível gerar conteúdo. Tente novamente.');
      }
    } catch (err) {
      console.error('Cascade error:', err);
      toast.error('Erro ao gerar conteúdo em cascata.');
    } finally {
      setCascadingNodeId(null);
    }
  }, [user, expandedQuestion, errorQuestions, queryClient]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <BookX className="h-5 w-5 text-destructive" />
              Caderno de Erros
            </h1>
            <p className="text-xs text-muted-foreground">
              {errorQuestions.length} {errorQuestions.length === 1 ? 'questão errada' : 'questões erradas'}
              {weakConceptCount > 0 && (
                <> · <span className="text-destructive font-semibold">{weakConceptCount} lacunas</span> identificadas</>
              )}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : errorQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground">Nenhum erro!</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Você não tem questões erradas. Continue estudando e as questões erradas aparecerão aqui automaticamente.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/dashboard')}>
              Voltar ao Dashboard
            </Button>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <span className="font-bold text-destructive text-lg">{errorQuestions.length}</span>{' '}
                  questões para revisar
                </div>
                {weakConceptCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <GitBranch className="h-3 w-3" />
                    {weakConceptCount} lacunas
                  </Badge>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                <div className="h-full rounded-full bg-destructive/80 transition-all" style={{ width: '100%' }} />
              </div>

              <p className="text-[10px] text-muted-foreground">
                Toque em uma questão para ver o <strong>diagnóstico hierárquico</strong> e preencher lacunas na base do conhecimento.
              </p>

              {/* Weakest concept global drill */}
              {weakestConcept && !drillTarget && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground mb-2">
                    Tema mais fraco identificado:
                  </p>
                  <ConceptDrillQuiz
                    conceptId={weakestConcept.id}
                    conceptName={weakestConcept.name}
                    conceptState={weakestConcept.state}
                    depth={1}
                    maxDepth={2}
                  />
                </div>
              )}

              {drillTarget && (
                <div className="pt-2 border-t border-border/30">
                  <ConceptDrillQuiz
                    conceptId={drillTarget.id}
                    conceptName={drillTarget.name}
                    conceptState={drillTarget.state}
                    depth={1}
                    maxDepth={2}
                    onComplete={() => setDrillTarget(null)}
                  />
                </div>
              )}
            </div>

            {/* Error questions grouped by deck */}
            {groupedByDeck.map(([deckId, { name, questions }]) => (
              <div key={deckId} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-foreground">{name}</h3>
                  <Badge variant="destructive" className="text-[10px]">{questions.length} erros</Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => navigate(`/decks/${deckId}`, { state: { tab: 'questions', filter: 'errors' } })}
                  >
                    <PlayCircle className="h-4 w-4" /> Revisar erros
                    <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigate(`/study/${deckId}`)}
                  >
                    <Layers className="h-4 w-4" /> Estudar cards
                  </Button>
                </div>

                <div className="space-y-2">
                  {questions.map((q, idx) => {
                    const plainText = q.question_text.replace(/<[^>]+>/g, '');
                    const weakest = q.linkedConcepts.length > 0 ? q.linkedConcepts[0] : null;
                    const isExpanded = expandedQuestion === q.id;
                    const isLoadingThis = loadingDiagnostic === q.id;
                    const diagnostic = diagnosticCache.get(q.id);

                    return (
                      <div key={q.id} className="space-y-0">
                        <button
                          className={`w-full text-left rounded-lg border px-3 py-2.5 space-y-1.5 transition-all ${
                            isExpanded
                              ? 'border-primary/40 bg-primary/5 rounded-b-none'
                              : 'border-destructive/20 bg-destructive/5 hover:bg-destructive/10'
                          }`}
                          onClick={() => loadDiagnostic(q.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-foreground line-clamp-2 flex-1">
                              {idx + 1}. {plainText}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              {isLoadingThis && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* Concept badges */}
                          {weakest && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                  weakest.state === 0 || weakest.state === 3
                                    ? 'bg-destructive/15 text-destructive'
                                    : weakest.state === 1
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                <BrainCircuit className="h-2.5 w-2.5" />
                                {weakest.name}
                                <span className="opacity-60">({STATE_LABELS[weakest.state] ?? 'Novo'})</span>
                              </span>
                              {q.linkedConcepts.length > 1 && (
                                <span className="text-[9px] text-muted-foreground">
                                  +{q.linkedConcepts.length - 1} tema{q.linkedConcepts.length - 1 > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          )}

                          {!weakest && q.concepts.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {q.concepts.map(c => (
                                <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c}</span>
                              ))}
                            </div>
                          )}
                        </button>

                        {/* Expanded: Hierarchy Diagnostic */}
                        {isExpanded && (
                          <div className="rounded-b-lg border border-t-0 border-primary/40 bg-card p-3 space-y-3 animate-fade-in">
                            {isLoadingThis && !diagnostic ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Analisando hierarquia de conhecimento...
                              </div>
                            ) : diagnostic ? (
                              <HierarchyTreeView
                                diagnostic={diagnostic}
                                onCascade={handleCascade}
                                cascadingNodeId={cascadingNodeId}
                              />
                            ) : (
                              <div className="text-center py-4 space-y-2">
                                <p className="text-xs text-muted-foreground">
                                  Nenhum conceito vinculado encontrado na hierarquia.
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  Gere questões para este baralho primeiro para criar vínculos de conceitos.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
};

export default ErrorNotebook;
