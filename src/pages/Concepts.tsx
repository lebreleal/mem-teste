/**
 * ConceptsPage — Global concept mastery with FSRS spaced repetition.
 * Clean card-based layout with inline editing for name, category, linked questions.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import type { GlobalConcept } from '@/services/globalConceptService';
import { MEDICAL_CATEGORIES, CATEGORY_SUBCATEGORIES, getConceptQuestions } from '@/services/globalConceptService';
import { getVariedQuestion } from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import BottomNav from '@/components/BottomNav';
import {
  BrainCircuit, ArrowLeft, Search, Play, Clock, Zap,
  X as XIcon, Pencil, Trash2, Link2, Unlink, MoreVertical,
  CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { Rating } from '@/lib/fsrs';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterType = 'all' | 'due' | 'learning' | 'mastered' | 'new';

const stateLabel = (state: number) => {
  switch (state) {
    case 0: return { label: 'Novo', class: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
    case 1: return { label: 'Aprendendo', class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
    case 2: return { label: 'Dominado', class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' };
    case 3: return { label: 'Reaprendendo', class: 'bg-destructive/10 text-destructive border-destructive/20' };
    default: return { label: 'Novo', class: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
  }
};

const nextReviewLabel = (scheduledDate: string) => {
  const d = new Date(scheduledDate);
  if (d <= new Date()) return 'Agora';
  return formatDistanceToNow(d, { locale: ptBR, addSuffix: true });
};

const ConceptsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    concepts, dueConcepts, isLoading,
    submitConceptReview, updateMeta, deleteConcept, unlinkQuestion,
  } = useGlobalConcepts();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  // Edit dialog
  const [editConcept, setEditConcept] = useState<GlobalConcept | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');

  // Questions sheet
  const [questionsConceptId, setQuestionsConceptId] = useState<string | null>(null);
  const [linkedQuestions, setLinkedQuestions] = useState<{ id: string; questionText: string; deckId: string; deckName?: string }[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<GlobalConcept | null>(null);

  // Study mode
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
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.category ?? '').toLowerCase().includes(q) ||
        (c.subcategory ?? '').toLowerCase().includes(q)
      );
    }
    if (filter === 'due') result = result.filter(isDue);
    if (filter === 'learning') result = result.filter(c => c.state === 1 || c.state === 3);
    if (filter === 'mastered') result = result.filter(c => c.state === 2);
    if (filter === 'new') result = result.filter(c => c.state === 0);
    return result;
  }, [concepts, search, filter, isDue]);

  const summary = useMemo(() => ({
    total: concepts.length,
    due: concepts.filter(isDue).length,
    new: concepts.filter(c => c.state === 0).length,
    learning: concepts.filter(c => c.state === 1 || c.state === 3).length,
    mastered: concepts.filter(c => c.state === 2).length,
  }), [concepts, isDue]);

  // ─── Edit handlers ───
  const openEdit = (c: GlobalConcept) => {
    setEditConcept(c);
    setEditName(c.name);
    setEditCategory(c.category || '');
    setEditSubcategory(c.subcategory || '');
  };

  const saveEdit = async () => {
    if (!editConcept || !editName.trim()) return;
    await updateMeta.mutateAsync({
      conceptId: editConcept.id,
      fields: {
        name: editName.trim(),
        category: editCategory || null,
        subcategory: editSubcategory || null,
      },
    });
    toast.success('Conceito atualizado');
    setEditConcept(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteConcept.mutateAsync(deleteTarget.id);
    toast.success('Conceito excluído');
    setDeleteTarget(null);
  };

  // ─── Questions sheet ───
  const openQuestions = async (conceptId: string) => {
    setQuestionsConceptId(conceptId);
    setLoadingQuestions(true);
    try {
      const qs = await getConceptQuestions(conceptId);
      setLinkedQuestions(qs);
    } catch { setLinkedQuestions([]); }
    setLoadingQuestions(false);
  };

  const handleUnlink = async (questionId: string) => {
    if (!questionsConceptId) return;
    await unlinkQuestion.mutateAsync({ conceptId: questionsConceptId, questionId });
    setLinkedQuestions(prev => prev.filter(q => q.id !== questionId));
    toast.success('Questão desvinculada');
  };

  // ─── Study mode ───
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

  const handleAnswer = () => {
    if (selectedOption === null || !currentQuestion) return;
    setConfirmed(true);
  };

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

  // ═══ Study Mode UI ═══
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
                <Button variant="outline" className="mt-4" onClick={() => handleRate(3)}>Pular</Button>
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
                <Button className="w-full" disabled={selectedOption === null} onClick={handleAnswer}>Confirmar</Button>
              ) : (
                <div className="space-y-3">
                  <div className={`rounded-xl border px-4 py-3 text-sm ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                    {isCorrect ? '✅ Correto!' : '❌ Incorreto'}
                    {currentQuestion.explanation && (
                      <p className="mt-2 text-xs text-muted-foreground">{currentQuestion.explanation}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" className="text-xs border-destructive/30 text-destructive" onClick={() => handleRate(1)}>Errei</Button>
                    <Button variant="outline" className="text-xs" onClick={() => handleRate(3)}>Bom</Button>
                    <Button variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400" onClick={() => handleRate(4)}>Fácil</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══ Main Dashboard ═══
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
          <p className="text-xs text-muted-foreground">Repetição espaçada por tema</p>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
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
            {/* Summary card */}
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
                  <div><p className="text-lg font-bold text-blue-500">{summary.new}</p><p className="text-[10px] text-muted-foreground">Novos</p></div>
                  <div><p className="text-lg font-bold text-amber-500">{summary.learning}</p><p className="text-[10px] text-muted-foreground">Aprendendo</p></div>
                  <div><p className="text-lg font-bold text-emerald-500">{summary.mastered}</p><p className="text-[10px] text-muted-foreground">Dominados</p></div>
                  <div><p className="text-lg font-bold text-primary">{summary.due}</p><p className="text-[10px] text-muted-foreground">Para revisar</p></div>
                </div>
              </CardContent>
            </Card>

            {/* Search + Filters */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar conceito..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {([
                { key: 'all' as FilterType, label: `Todos (${summary.total})` },
                { key: 'due' as FilterType, label: `Revisar (${summary.due})` },
                { key: 'new' as FilterType, label: `Novos (${summary.new})` },
                { key: 'learning' as FilterType, label: `Aprendendo (${summary.learning})` },
                { key: 'mastered' as FilterType, label: `Dominados (${summary.mastered})` },
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

            {/* Concept list — flat, card-based like cards/questions */}
            <div className="space-y-2">
              {filtered.map(concept => {
                const sl = stateLabel(concept.state);
                const totalAttempts = concept.correct_count + concept.wrong_count;
                const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;
                const due = isDue(concept);

                return (
                  <div
                    key={concept.id}
                    className="rounded-xl border border-border/60 bg-card p-3 space-y-2"
                  >
                    {/* Top row: name + actions */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{concept.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 border ${sl.class}`}>
                            {sl.label}
                          </Badge>
                          {concept.category && (
                            <span className="text-[10px] text-muted-foreground">
                              {concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}
                            </span>
                          )}
                          {!concept.category && (
                            <span className="text-[10px] text-muted-foreground italic">Sem categoria</span>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEdit(concept)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openQuestions(concept.id)}>
                            <Link2 className="h-3.5 w-3.5 mr-2" /> Questões vinculadas
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(concept)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {totalAttempts > 0 && (
                        <>
                          <span>Acerto: <span className="font-medium text-foreground">{accuracy}%</span> ({concept.correct_count}/{totalAttempts})</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {due && concept.state !== 0
                          ? <span className="text-primary font-medium">Revisar agora</span>
                          : concept.state === 0
                            ? 'Nunca estudado'
                            : `Próxima ${nextReviewLabel(concept.scheduled_date)}`
                        }
                      </span>
                    </div>

                    {/* Accuracy bar */}
                    {totalAttempts > 0 && (
                      <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${accuracy >= 70 ? 'bg-emerald-500' : accuracy >= 40 ? 'bg-amber-500' : 'bg-destructive'}`}
                          style={{ width: `${accuracy}%` }}
                        />
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

      {/* ─── Edit Dialog ─── */}
      <Dialog open={!!editConcept} onOpenChange={o => { if (!o) setEditConcept(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar conceito</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Grande Área</label>
              <Select value={editCategory} onValueChange={v => { setEditCategory(v); setEditSubcategory(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem categoria</SelectItem>
                  {MEDICAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editCategory && CATEGORY_SUBCATEGORIES[editCategory] && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Especialidade</label>
                <Select value={editSubcategory} onValueChange={setEditSubcategory}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geral</SelectItem>
                    {CATEGORY_SUBCATEGORIES[editCategory].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditConcept(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={!editName.trim() || updateMeta.isPending}>
              {updateMeta.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir conceito</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>?
            Os vínculos com questões serão removidos, mas as questões não serão afetadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteConcept.isPending}>
              {deleteConcept.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Questions Sheet ─── */}
      <Sheet open={!!questionsConceptId} onOpenChange={o => { if (!o) { setQuestionsConceptId(null); setLinkedQuestions([]); } }}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Questões vinculadas
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="mt-3 max-h-[50vh]">
            {loadingQuestions ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : linkedQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma questão vinculada.</p>
            ) : (
              <div className="space-y-2 p-1">
                {linkedQuestions.map(q => (
                  <div key={q.id} className="flex items-start gap-2 rounded-lg border border-border/50 bg-card p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground line-clamp-2">{q.questionText}</p>
                      {q.deckName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Baralho: {q.deckName}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnlink(q.id)}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
};

export default ConceptsPage;
