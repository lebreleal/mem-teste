/**
 * ConceptsPage — Global concept mastery dashboard with FSRS-based study.
 * Groups concepts by Grande Área (Estratégia MED / Medway / SanarFlix taxonomy).
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import type { GlobalConcept } from '@/services/globalConceptService';
import { MEDICAL_CATEGORIES } from '@/services/globalConceptService';
import { getVariedQuestion } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import BottomNav from '@/components/BottomNav';
import {
  BrainCircuit, ArrowLeft, Search, Play, CheckCircle2, AlertCircle,
  X as XIcon, Clock, ChevronDown, ChevronUp, Zap, BookOpen,
  Stethoscope, Syringe, Baby, Heart, ShieldCheck, Folder,
} from 'lucide-react';
import type { Rating } from '@/lib/fsrs';

type FilterType = 'all' | 'due' | 'learning' | 'strong';

const stateLabel = (state: number) => {
  switch (state) {
    case 0: return { label: 'Novo', color: 'text-blue-500', bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
    case 1: return { label: 'Aprendendo', color: 'text-amber-500', bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
    case 2: return { label: 'Dominado', color: 'text-emerald-500', bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
    case 3: return { label: 'Reaprendendo', color: 'text-destructive', bg: 'bg-destructive/10 text-destructive border-destructive/20' };
    default: return { label: 'Novo', color: 'text-blue-500', bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
  }
};

const categoryIcon = (cat: string) => {
  switch (cat) {
    case 'Clínica Médica': return <Stethoscope className="h-4 w-4" />;
    case 'Cirurgia': return <Syringe className="h-4 w-4" />;
    case 'Ginecologia e Obstetrícia': return <Heart className="h-4 w-4" />;
    case 'Pediatria': return <Baby className="h-4 w-4" />;
    case 'Medicina Preventiva': return <ShieldCheck className="h-4 w-4" />;
    default: return <Folder className="h-4 w-4" />;
  }
};

const categoryColor = (cat: string) => {
  switch (cat) {
    case 'Clínica Médica': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    case 'Cirurgia': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    case 'Ginecologia e Obstetrícia': return 'text-pink-500 bg-pink-500/10 border-pink-500/20';
    case 'Pediatria': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    case 'Medicina Preventiva': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    default: return 'text-muted-foreground bg-muted/50 border-border';
  }
};

const ConceptsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { concepts, dueConcepts, isLoading, submitConceptReview } = useGlobalConcepts();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Study mode state
  const [studyMode, setStudyMode] = useState(false);
  const [studyQueue, setStudyQueue] = useState<GlobalConcept[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  const now = useMemo(() => new Date(), []);

  const isDue = useCallback((c: GlobalConcept) => new Date(c.scheduled_date) <= now, [now]);

  const filtered = useMemo(() => {
    let result = concepts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.subcategory ?? '').toLowerCase().includes(q));
    }
    if (filter === 'due') result = result.filter(isDue);
    if (filter === 'learning') result = result.filter(c => c.state === 1 || c.state === 3);
    if (filter === 'strong') result = result.filter(c => c.state === 2);
    return result;
  }, [concepts, search, filter, isDue]);

  // Group by category → subcategory
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, GlobalConcept[]>>();

    for (const c of filtered) {
      const cat = c.category || 'Sem categoria';
      const sub = c.subcategory || 'Geral';
      if (!map.has(cat)) map.set(cat, new Map());
      const subMap = map.get(cat)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(c);
    }

    // Sort: medical categories first in standard order, then others
    const ordered: { category: string; subcategories: { name: string; concepts: GlobalConcept[] }[] }[] = [];
    const catOrder = [...MEDICAL_CATEGORIES, 'Outras', 'Sem categoria'];

    for (const cat of catOrder) {
      if (map.has(cat)) {
        const subMap = map.get(cat)!;
        const subs = Array.from(subMap.entries())
          .map(([name, concepts]) => ({ name, concepts }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        ordered.push({ category: cat, subcategories: subs });
        map.delete(cat);
      }
    }
    // Any remaining categories
    for (const [cat, subMap] of map) {
      const subs = Array.from(subMap.entries())
        .map(([name, concepts]) => ({ name, concepts }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      ordered.push({ category: cat, subcategories: subs });
    }

    return ordered;
  }, [filtered]);

  const summary = useMemo(() => ({
    total: concepts.length,
    due: concepts.filter(isDue).length,
    new: concepts.filter(c => c.state === 0).length,
    learning: concepts.filter(c => c.state === 1 || c.state === 3).length,
    mastered: concepts.filter(c => c.state === 2).length,
  }), [concepts, isDue]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Start study mode
  const handleStartStudy = useCallback(async () => {
    if (!user) return;
    const queue = dueConcepts.length > 0 ? dueConcepts : concepts.filter(c => c.state === 0).slice(0, 10);
    if (queue.length === 0) return;
    setStudyQueue(queue);
    setStudyIndex(0);
    setStudyMode(true);
    setLoadingQuestion(true);
    try {
      const q = await getVariedQuestion(queue[0].id, user.id);
      setCurrentQuestion(q);
    } catch { setCurrentQuestion(null); }
    setLoadingQuestion(false);
  }, [user, dueConcepts, concepts]);

  const handleAnswer = useCallback(async () => {
    if (selectedOption === null || !currentQuestion) return;
    setConfirmed(true);
  }, [selectedOption, currentQuestion]);

  const handleRate = useCallback(async (rating: Rating) => {
    const concept = studyQueue[studyIndex];
    if (!concept) return;

    const isCorrect = currentQuestion?.correctIndices?.includes(selectedOption) ?? false;
    await submitConceptReview.mutateAsync({ concept, rating, isCorrect });

    const nextIdx = studyIndex + 1;
    if (nextIdx >= studyQueue.length) {
      setStudyMode(false);
      setStudyQueue([]);
      setStudyIndex(0);
      setCurrentQuestion(null);
      setSelectedOption(null);
      setConfirmed(false);
      return;
    }

    setStudyIndex(nextIdx);
    setSelectedOption(null);
    setConfirmed(false);
    setLoadingQuestion(true);
    try {
      const q = await getVariedQuestion(studyQueue[nextIdx].id, user!.id);
      setCurrentQuestion(q);
    } catch { setCurrentQuestion(null); }
    setLoadingQuestion(false);
  }, [studyQueue, studyIndex, currentQuestion, selectedOption, submitConceptReview, user]);

  // ─── Study Mode UI ───
  if (studyMode) {
    const concept = studyQueue[studyIndex];
    const isCorrect = currentQuestion?.correctIndices?.includes(selectedOption) ?? false;

    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-card/95 backdrop-blur-md px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => setStudyMode(false)}>
            <XIcon className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Conceito {studyIndex + 1}/{studyQueue.length}</p>
            <p className="text-sm font-semibold text-foreground truncate">{concept?.name}</p>
            {concept?.category && (
              <p className="text-[10px] text-muted-foreground">{concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}</p>
            )}
          </div>
          <Progress value={((studyIndex + 1) / studyQueue.length) * 100} className="w-20 h-1.5" />
        </header>

        <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
          {loadingQuestion ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : !currentQuestion ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BrainCircuit className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma questão vinculada a este conceito.</p>
                <Button variant="outline" className="mt-4" onClick={() => handleRate(3)}>
                  Pular
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-border/50">
                <CardContent className="pt-4 pb-3">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{currentQuestion.questionText}</p>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {(currentQuestion.options ?? []).map((opt: string, i: number) => {
                  const isSelected = selectedOption === i;
                  const isCorrectOpt = currentQuestion.correctIndices?.includes(i);

                  let optClasses = 'border-border/50 bg-card hover:bg-accent/30';
                  if (confirmed) {
                    if (isCorrectOpt) optClasses = 'border-emerald-500 bg-emerald-500/10';
                    else if (isSelected && !isCorrectOpt) optClasses = 'border-destructive bg-destructive/10';
                  } else if (isSelected) {
                    optClasses = 'border-primary bg-primary/5';
                  }

                  return (
                    <button
                      key={i}
                      disabled={confirmed}
                      onClick={() => setSelectedOption(i)}
                      className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm transition-all ${optClasses}`}
                    >
                      <span className="font-medium text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {!confirmed ? (
                <Button className="w-full" disabled={selectedOption === null} onClick={handleAnswer}>
                  Confirmar
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className={`rounded-xl border px-4 py-3 text-sm ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                    {isCorrect ? '✅ Correto!' : '❌ Incorreto'}
                    {currentQuestion.explanation && (
                      <p className="mt-2 text-xs text-muted-foreground">{currentQuestion.explanation}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" className="text-xs border-destructive/30 text-destructive" onClick={() => handleRate(1)}>
                      Errei
                    </Button>
                    <Button variant="outline" className="text-xs" onClick={() => handleRate(3)}>
                      Bom
                    </Button>
                    <Button variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400" onClick={() => handleRate(4)}>
                      Fácil
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Main Dashboard UI ───
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-card/95 backdrop-blur-md px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            Conceitos
          </h1>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : concepts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BrainCircuit className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">Nenhum conceito ainda</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Gere questões nos seus baralhos para que os conceitos apareçam aqui automaticamente.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{summary.total}</p>
                    <p className="text-xs text-muted-foreground">conceitos totais</p>
                  </div>
                  {summary.due > 0 && (
                    <Button size="sm" className="gap-1.5" onClick={handleStartStudy}>
                      <Play className="h-4 w-4" />
                      Revisar {summary.due}
                    </Button>
                  )}
                  {summary.due === 0 && summary.new > 0 && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={handleStartStudy}>
                      <Zap className="h-4 w-4" />
                      Estudar novos
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-blue-500">{summary.new}</p>
                    <p className="text-[10px] text-muted-foreground">Novos</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-500">{summary.learning}</p>
                    <p className="text-[10px] text-muted-foreground">Aprendendo</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-500">{summary.mastered}</p>
                    <p className="text-[10px] text-muted-foreground">Dominados</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">{summary.due}</p>
                    <p className="text-[10px] text-muted-foreground">Para revisar</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search + Filters */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar conceito ou tema..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {([
                { key: 'all' as FilterType, label: 'Todos' },
                { key: 'due' as FilterType, label: `Para revisar (${summary.due})` },
                { key: 'learning' as FilterType, label: 'Aprendendo' },
                { key: 'strong' as FilterType, label: 'Dominados' },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Grouped concept list */}
            <div className="space-y-3">
              {grouped.map(group => {
                const isCollapsed = collapsedCategories.has(group.category);
                const catConceptCount = group.subcategories.reduce((acc, s) => acc + s.concepts.length, 0);
                const catDueCount = group.subcategories.reduce((acc, s) => acc + s.concepts.filter(isDue).length, 0);

                return (
                  <div key={group.category} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Category header */}
                    <button
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                      onClick={() => toggleCategory(group.category)}
                    >
                      <span className={`flex items-center justify-center h-8 w-8 rounded-lg border ${categoryColor(group.category)}`}>
                        {categoryIcon(group.category)}
                      </span>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-foreground">{group.category}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {catConceptCount} conceito{catConceptCount !== 1 ? 's' : ''}
                          {catDueCount > 0 && <span className="text-primary font-medium"> · {catDueCount} para revisar</span>}
                        </p>
                      </div>
                      {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>

                    {!isCollapsed && (
                      <div className="border-t border-border/50">
                        {group.subcategories.map(sub => (
                          <div key={sub.name}>
                            {/* Subcategory label */}
                            {sub.name !== 'Geral' && (
                              <div className="px-4 pt-2 pb-1">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{sub.name}</p>
                              </div>
                            )}
                            {/* Concepts in this subcategory */}
                            {sub.concepts.map(concept => {
                              const sl = stateLabel(concept.state);
                              const isExpanded = expandedId === concept.id;
                              const totalAttempts = concept.correct_count + concept.wrong_count;
                              const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;
                              const due = isDue(concept);

                              return (
                                <div key={concept.id} className="border-t border-border/30">
                                  <button
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors"
                                    onClick={() => setExpandedId(isExpanded ? null : concept.id)}
                                  >
                                    {concept.state === 2 ? (
                                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                    ) : concept.state === 1 || concept.state === 3 ? (
                                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                                    ) : (
                                      <BookOpen className="h-4 w-4 shrink-0 text-blue-500" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{concept.name}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <Badge variant="outline" className={`text-[9px] h-4 px-1.5 border ${sl.bg}`}>
                                          {sl.label}
                                        </Badge>
                                        {totalAttempts > 0 && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {concept.correct_count}/{totalAttempts} ({accuracy}%)
                                          </span>
                                        )}
                                        {due && concept.state !== 0 && (
                                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border border-primary/30 bg-primary/5 text-primary">
                                            <Clock className="h-2.5 w-2.5 mr-0.5" /> Revisar
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                  </button>

                                  {isExpanded && (
                                    <div className="border-t border-border/30 px-4 pb-3 pt-2 space-y-2 bg-muted/10">
                                      {totalAttempts > 0 && (
                                        <div className="space-y-1">
                                          <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Taxa de acerto</span>
                                            <span className="font-medium text-foreground">{accuracy}%</span>
                                          </div>
                                          <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${accuracy >= 70 ? 'bg-emerald-500' : accuracy >= 40 ? 'bg-amber-500' : 'bg-destructive'}`}
                                              style={{ width: `${accuracy}%` }}
                                            />
                                          </div>
                                        </div>
                                      )}
                                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                                        <div>Acertos: <span className="font-medium text-foreground">{concept.correct_count}</span></div>
                                        <div>Erros: <span className="font-medium text-foreground">{concept.wrong_count}</span></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum conceito encontrado.</p>
              )}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default ConceptsPage;
