/**
 * ConceptsPage — Global concept library with 3 tabs: Meus, Oficiais, Comunidade.
 * Meus: personal concepts with FSRS. Oficiais: official tag-concepts. Comunidade: shared concepts.
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import type { GlobalConcept } from '@/services/globalConceptService';
import {
  MEDICAL_CATEGORIES, CATEGORY_SUBCATEGORIES, getConceptQuestions, linkQuestionsToConcepts,
  getVariedQuestion, fetchOfficialConcepts, fetchCommunityConcepts, importConcept, importConceptWithContent,
  fetchReadyToLearnConcepts, mapPrerequisitesViaAI, fetchDiagnosticConcepts, markConceptMastered, markConceptWeak,
} from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import BottomNav from '@/components/BottomNav';
import {
  BrainCircuit, ArrowLeft, Search, Play, Clock, Zap,
  X as XIcon, Pencil, Trash2, Link2, Unlink, MoreVertical,
  CheckCheck, Filter, Plus, Download, Users, ShieldCheck, Unlock,
  Lock, Wand2, Stethoscope, PieChart,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { Rating } from '@/lib/fsrs';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

type StateFilter = 'all' | 'due' | 'new' | 'learning' | 'mastered';

const stateInfo = (state: number) => {
  switch (state) {
    case 0: return { label: 'Novo', color: 'bg-muted-foreground/20 text-muted-foreground' };
    case 1: return { label: 'Aprendendo', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' };
    case 2: return { label: 'Dominado', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
    case 3: return { label: 'Reaprendendo', color: 'bg-destructive/15 text-destructive' };
    default: return { label: 'Novo', color: 'bg-muted-foreground/20 text-muted-foreground' };
  }
};

const nextReviewLabel = (scheduledDate: string) => {
  const d = new Date(scheduledDate);
  if (d <= new Date()) return 'Revisão agora';
  return `Próx: ${formatDistanceToNow(d, { locale: ptBR, addSuffix: false })}`;
};

// ═══════════════════════════════════════════════════
// Oficiais Tab Component
// ═══════════════════════════════════════════════════
const OficiaisTab = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const { data: officialConcepts = [], isLoading } = useQuery({
    queryKey: ['official-concepts'],
    queryFn: fetchOfficialConcepts,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!search) return officialConcepts;
    const q = search.toLowerCase();
    return officialConcepts.filter(c => c.name.toLowerCase().includes(q));
  }, [officialConcepts, search]);

  const handleImport = async (concept: typeof officialConcepts[0]) => {
    if (!user) return;
    setImporting(concept.id);
    try {
      await importConcept(user.id, {
        name: concept.name,
        conceptTagId: concept.id,
      });
      toast.success(`"${concept.name}" adicionado aos seus conceitos`);
    } catch {
      toast.error('Erro ao importar conceito');
    }
    setImporting(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (officialConcepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
        <h3 className="font-display text-lg font-semibold text-foreground">Nenhum conceito oficial ainda</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Conceitos oficiais da plataforma aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {officialConcepts.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar conceitos oficiais" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      )}
      <div className="space-y-2">
        {filtered.map(concept => (
          <div key={concept.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{concept.name}</p>
              {concept.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{concept.description}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              disabled={importing === concept.id}
              onClick={() => handleImport(concept)}
            >
              <Download className="h-3.5 w-3.5" />
              {importing === concept.id ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// Comunidade Tab Component
// ═══════════════════════════════════════════════════
const ComunidadeTab = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const { data: communityConcepts = [], isLoading } = useQuery({
    queryKey: ['community-concepts', user?.id],
    queryFn: () => fetchCommunityConcepts(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    if (!search) return communityConcepts;
    const q = search.toLowerCase();
    return communityConcepts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.category ?? '').toLowerCase().includes(q)
    );
  }, [communityConcepts, search]);

  const handleImportWithContent = async (concept: GlobalConcept) => {
    if (!user) return;
    setImporting(concept.id);
    try {
      const result = await importConceptWithContent(user.id, concept.id, {
        name: concept.name,
        category: concept.category ?? undefined,
        subcategory: concept.subcategory ?? undefined,
      });
      toast.success(`"${concept.name}" importado: ${result.questionCount} questões, ${result.cardCount} cards`);
    } catch {
      toast.error('Erro ao importar conceito');
    }
    setImporting(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (communityConcepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
        <h3 className="font-display text-lg font-semibold text-foreground">Nenhum conceito na comunidade</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Conceitos compartilhados por outros usuários aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {communityConcepts.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar conceitos da comunidade" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      )}
      <div className="space-y-2">
        {filtered.map(concept => {
          const totalAttempts = concept.correct_count + concept.wrong_count;
          const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;

          return (
            <div key={concept.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{concept.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  {concept.category && <span>{concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}</span>}
                  {totalAttempts > 0 && <span>· {accuracy}% acerto</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                disabled={importing === concept.id}
                onClick={() => handleImportWithContent(concept)}
              >
                <Download className="h-3.5 w-3.5" />
                {importing === concept.id ? 'Importando...' : 'Importar'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// Category Donut Chart (ALEKS-style progress)
// ═══════════════════════════════════════════════════
const CATEGORY_COLORS = [
  'hsl(var(--primary))',
  'hsl(200, 70%, 50%)',
  'hsl(150, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 65%, 55%)',
];

const CategoryDonutChart = ({
  concepts,
  onCategoryClick,
}: {
  concepts: GlobalConcept[];
  onCategoryClick: (category: string | null) => void;
}) => {
  const categoryData = useMemo(() => {
    const catMap = new Map<string, { total: number; mastered: number }>();
    for (const c of concepts) {
      const cat = c.category || 'Sem categoria';
      const entry = catMap.get(cat) ?? { total: 0, mastered: 0 };
      entry.total++;
      if (c.state === 2) entry.mastered++;
      catMap.set(cat, entry);
    }
    return Array.from(catMap.entries())
      .map(([name, { total, mastered }]) => ({
        name,
        value: total,
        mastered,
        pct: Math.round((mastered / total) * 100),
      }))
      .sort((a, b) => b.value - a.value);
  }, [concepts]);

  if (categoryData.length === 0) return null;

  const totalMastered = concepts.filter(c => c.state === 2).length;
  const totalPct = concepts.length > 0 ? Math.round((totalMastered / concepts.length) * 100) : 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <PieChart className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">Progresso por Área</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={42}
                dataKey="value"
                stroke="none"
                onClick={(_, idx) => onCategoryClick(categoryData[idx]?.name === 'Sem categoria' ? null : categoryData[idx]?.name)}
                style={{ cursor: 'pointer' }}
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} opacity={0.85} />
                ))}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-foreground">{totalPct}%</span>
          </div>
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          {categoryData.slice(0, 5).map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => onCategoryClick(cat.name === 'Sem categoria' ? null : cat.name)}
              className="flex items-center gap-1.5 w-full text-left hover:bg-accent/30 rounded px-1 py-0.5 transition-colors"
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
              <span className="text-[10px] text-muted-foreground truncate flex-1">{cat.name}</span>
              <span className="text-[10px] font-medium text-foreground">{cat.pct}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// Ready-to-Learn Frontier (ALEKS-style)
// ═══════════════════════════════════════════════════
const ReadyToLearnSection = ({ onStartStudy }: { onStartStudy: (concept: GlobalConcept) => void }) => {
  const { user } = useAuth();

  const { data: readyConcepts = [], isLoading } = useQuery({
    queryKey: ['ready-to-learn', user?.id],
    queryFn: () => fetchReadyToLearnConcepts(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });

  if (isLoading || readyConcepts.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Unlock className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-primary">Prontos para aprender</p>
        <Badge variant="secondary" className="text-[9px] ml-auto">{readyConcepts.length}</Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Conceitos cujos pré-requisitos já foram dominados — a fronteira do seu conhecimento.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {readyConcepts.slice(0, 8).map(c => (
          <button
            key={c.id}
            onClick={() => onStartStudy(c)}
            className="flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Play className="h-2.5 w-2.5" />
            {c.name}
          </button>
        ))}
        {readyConcepts.length > 8 && (
          <span className="text-[10px] text-muted-foreground self-center">
            +{readyConcepts.length - 8} mais
          </span>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// Main ConceptsPage
// ═══════════════════════════════════════════════════
const ConceptsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    concepts, dueConcepts, isLoading,
    submitConceptReview, updateMeta, deleteConcept, unlinkQuestion,
  } = useGlobalConcepts();

  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('meus');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Map prerequisites
  const [mappingPrereqs, setMappingPrereqs] = useState(false);

  // Diagnostic mode
  const [diagnosticMode, setDiagnosticMode] = useState(false);
  const [diagnosticQueue, setDiagnosticQueue] = useState<GlobalConcept[]>([]);
  const [diagnosticIndex, setDiagnosticIndex] = useState(0);
  const [diagnosticQuestion, setDiagnosticQuestion] = useState<any>(null);
  const [diagnosticSelected, setDiagnosticSelected] = useState<number | null>(null);
  const [diagnosticConfirmed, setDiagnosticConfirmed] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticResults, setDiagnosticResults] = useState<{ correct: number; wrong: number }>({ correct: 0, wrong: 0 });

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit dialog
  const [editConcept, setEditConcept] = useState<GlobalConcept | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');

  // Questions sheet
  const [questionsConceptId, setQuestionsConceptId] = useState<string | null>(null);
  const [linkedQuestions, setLinkedQuestions] = useState<{ id: string; questionText: string; deckId: string; deckName?: string }[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Add concept to question dialog
  const [addConceptOpen, setAddConceptOpen] = useState(false);
  const [addConceptQuestionId, setAddConceptQuestionId] = useState<string | null>(null);
  const [addConceptName, setAddConceptName] = useState('');
  const [addConceptCategory, setAddConceptCategory] = useState('');
  const [addConceptSubcategory, setAddConceptSubcategory] = useState('');
  const [addConceptSaving, setAddConceptSaving] = useState(false);

  // Delete confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<GlobalConcept | null>(null);

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

  const counts = useMemo(() => ({
    total: concepts.length,
    due: concepts.filter(isDue).length,
    new: concepts.filter(c => c.state === 0).length,
    learning: concepts.filter(c => c.state === 1 || c.state === 3).length,
    mastered: concepts.filter(c => c.state === 2).length,
  }), [concepts, isDue]);

  // Build locked-concept set (parent not mastered)
  const lockedIds = useMemo(() => {
    const byId = new Map(concepts.map(c => [c.id, c]));
    const locked = new Set<string>();
    for (const c of concepts) {
      if (c.parent_concept_id) {
        const parent = byId.get(c.parent_concept_id);
        if (parent && parent.state !== 2) locked.add(c.id);
      }
    }
    return locked;
  }, [concepts]);

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
    if (categoryFilter) {
      result = result.filter(c => c.category === categoryFilter);
    }
    if (stateFilter === 'due') result = result.filter(isDue);
    if (stateFilter === 'new') result = result.filter(c => c.state === 0);
    if (stateFilter === 'learning') result = result.filter(c => c.state === 1 || c.state === 3);
    if (stateFilter === 'mastered') result = result.filter(c => c.state === 2);
    return result;
  }, [concepts, search, stateFilter, categoryFilter, isDue]);

  const hasActiveFilter = stateFilter !== 'all' || !!categoryFilter;

  // Map prerequisites handler
  const handleMapPrerequisites = async () => {
    if (!user) return;
    setMappingPrereqs(true);
    try {
      const count = await mapPrerequisitesViaAI(user.id);
      toast.success(`${count} pré-requisito${count !== 1 ? 's' : ''} mapeado${count !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      queryClient.invalidateQueries({ queryKey: ['ready-to-learn'] });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao mapear pré-requisitos');
    }
    setMappingPrereqs(false);
  };

  // Diagnostic flow
  const handleStartDiagnostic = async () => {
    if (!user) return;
    setDiagnosticLoading(true);
    try {
      const queue = await fetchDiagnosticConcepts(user.id);
      if (queue.length === 0) {
        toast.error('Nenhum conceito disponível para diagnóstico');
        setDiagnosticLoading(false);
        return;
      }
      setDiagnosticQueue(queue);
      setDiagnosticIndex(0);
      setDiagnosticResults({ correct: 0, wrong: 0 });
      setDiagnosticMode(true);
      const q = await getVariedQuestion(queue[0].id, user.id);
      setDiagnosticQuestion(q);
    } catch { toast.error('Erro ao iniciar diagnóstico'); }
    setDiagnosticLoading(false);
  };

  const handleDiagnosticAnswer = async () => {
    if (diagnosticSelected === null || !diagnosticQuestion) return;
    setDiagnosticConfirmed(true);
  };

  const handleDiagnosticNext = async (wasCorrect: boolean) => {
    const concept = diagnosticQueue[diagnosticIndex];
    if (!concept || !user) return;

    // Mark concept based on answer
    if (wasCorrect) {
      await markConceptMastered(concept.id);
      setDiagnosticResults(r => ({ ...r, correct: r.correct + 1 }));
    } else {
      await markConceptWeak(concept.id);
      setDiagnosticResults(r => ({ ...r, wrong: r.wrong + 1 }));
    }

    const nextIdx = diagnosticIndex + 1;
    if (nextIdx >= diagnosticQueue.length) {
      setDiagnosticMode(false);
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      queryClient.invalidateQueries({ queryKey: ['ready-to-learn'] });
      toast.success(`Diagnóstico concluído: ${diagnosticResults.correct + (wasCorrect ? 1 : 0)} acertos, ${diagnosticResults.wrong + (wasCorrect ? 0 : 1)} erros`);
      return;
    }

    setDiagnosticIndex(nextIdx);
    setDiagnosticSelected(null);
    setDiagnosticConfirmed(false);
    setDiagnosticLoading(true);
    try {
      const q = await getVariedQuestion(diagnosticQueue[nextIdx].id, user.id);
      setDiagnosticQuestion(q);
    } catch { setDiagnosticQuestion(null); }
    setDiagnosticLoading(false);
  };
  const newPct = counts.total > 0 ? (counts.new / counts.total) * 100 : 0;
  const learningPct = counts.total > 0 ? (counts.learning / counts.total) * 100 : 0;
  const masteredPct = counts.total > 0 ? (counts.mastered / counts.total) * 100 : 0;

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(c => c.id)));
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteSingleTarget(null);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteSingleTarget) {
      await deleteConcept.mutateAsync(deleteSingleTarget.id);
      toast.success('Conceito excluído');
    } else {
      const ids = Array.from(selectedIds);
      for (const id of ids) await deleteConcept.mutateAsync(id);
      toast.success(`${ids.length} conceito${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
    setDeleteConfirmOpen(false);
    setDeleteSingleTarget(null);
  };

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
      fields: { name: editName.trim(), category: editCategory || null, subcategory: editSubcategory || null },
    });
    toast.success('Conceito atualizado');
    setEditConcept(null);
  };

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

  const openAddConcept = (questionId: string) => {
    setAddConceptQuestionId(questionId);
    setAddConceptName('');
    setAddConceptCategory('');
    setAddConceptSubcategory('');
    setAddConceptOpen(true);
  };

  const handleAddConcept = async () => {
    if (!user || !addConceptQuestionId || !addConceptName.trim()) return;
    setAddConceptSaving(true);
    try {
      await linkQuestionsToConcepts(user.id, [{
        questionId: addConceptQuestionId,
        conceptNames: [addConceptName.trim()],
        category: addConceptCategory || undefined,
        subcategory: addConceptSubcategory || undefined,
      }]);
      toast.success(`Conceito "${addConceptName.trim()}" vinculado`);
      setAddConceptOpen(false);
    } catch { toast.error('Erro ao vincular conceito'); }
    setAddConceptSaving(false);
  };

  // Study mode
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

  // ═══ Main Page ═══
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
          <p className="text-xs text-muted-foreground">Biblioteca de conceitos</p>
        </div>
        {activeTab === 'meus' && counts.due > 0 && (
          <Button size="sm" className="gap-1.5" onClick={handleStartStudy}>
            <Play className="h-4 w-4" />
            Revisar {counts.due}
          </Button>
        )}
        {activeTab === 'meus' && counts.due === 0 && counts.new > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleStartStudy}>
            <Zap className="h-4 w-4" />
            Estudar novos
          </Button>
        )}
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="meus" className="gap-1.5 text-xs">
              <BrainCircuit className="h-3.5 w-3.5" />
              Meus ({counts.total})
            </TabsTrigger>
            <TabsTrigger value="oficiais" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              Oficiais
            </TabsTrigger>
            <TabsTrigger value="comunidade" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Comunidade
            </TabsTrigger>
          </TabsList>

          {/* ═══ Meus Tab ═══ */}
          <TabsContent value="meus" className="mt-3 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : concepts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
                <BrainCircuit className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                <h3 className="font-display text-lg font-semibold text-foreground">Nenhum conceito ainda</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gere questões nos seus baralhos ou importe das abas Oficiais/Comunidade.
                </p>
              </div>
            ) : (
              <>
                {/* Title bar */}
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-foreground shrink-0">
                    Conceitos ({counts.total})
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={hasActiveFilter ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-8 w-8 relative"
                      onClick={() => setShowFilters(!showFilters)}
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveFilter && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary" />}
                    </Button>
                    <Button
                      variant={selectionMode ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }}
                    >
                      {selectionMode ? <XIcon className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Selection bar */}
                {selectionMode && selectedIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <span className="text-sm font-medium text-foreground">{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={selectAll}>
                        <CheckCheck className="h-3.5 w-3.5" /> {selectedIds.size === filtered.length ? 'Desmarcar' : 'Todos'}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={handleBulkDelete}>
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {!selectionMode && (
                  <div>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="bg-muted-foreground/30 transition-all" style={{ width: `${newPct}%` }} />
                      <div className="transition-all" style={{ width: `${learningPct}%`, backgroundColor: '#47c700' }} />
                      <div className="bg-primary transition-all" style={{ width: `${masteredPct}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> <strong className="text-foreground">{counts.new}</strong> Novos
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#47c700' }} /> <strong className="text-foreground">{counts.learning}</strong> Aprendendo
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-primary" /> <strong className="text-foreground">{counts.mastered}</strong> Dominados
                      </span>
                      {counts.due > 0 && (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <Clock className="h-2.5 w-2.5" /> {counts.due} para revisar
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Search */}
                {counts.total > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Pesquisar conceitos" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                  </div>
                )}

                {/* Filters */}
                {showFilters && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Estado de domínio</p>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          { value: 'all' as StateFilter, label: 'Todos', count: counts.total },
                          { value: 'due' as StateFilter, label: 'Para revisar', count: counts.due },
                          { value: 'new' as StateFilter, label: 'Novos', count: counts.new },
                          { value: 'learning' as StateFilter, label: 'Aprendendo', count: counts.learning },
                          { value: 'mastered' as StateFilter, label: 'Dominados', count: counts.mastered },
                        ]).map(f => (
                          <button
                            key={f.value}
                            onClick={() => setStateFilter(f.value)}
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              stateFilter === f.value
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
                      <button onClick={() => setStateFilter('all')} className="text-xs text-primary hover:underline">
                        Limpar filtros
                      </button>
                    )}
                  </div>
                )}

                {/* Ready-to-Learn Frontier (ALEKS) */}
                <ReadyToLearnSection onStartStudy={(concept) => {
                  setStudyQueue([concept]);
                  setStudyIndex(0);
                  setStudyMode(true);
                  setLoadingQuestion(true);
                  getVariedQuestion(concept.id, user!.id).then(q => {
                    setCurrentQuestion(q);
                    setLoadingQuestion(false);
                  }).catch(() => { setCurrentQuestion(null); setLoadingQuestion(false); });
                }} />

                {/* Concept list */}
                <div className="space-y-2.5">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
                      <h3 className="font-display text-lg font-semibold text-foreground">
                        {hasActiveFilter ? 'Nenhum conceito encontrado' : 'Nenhum conceito'}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hasActiveFilter ? 'Tente ajustar os filtros.' : ''}
                      </p>
                    </div>
                  ) : filtered.map(concept => {
                    const si = stateInfo(concept.state);
                    const isSelected = selectedIds.has(concept.id);
                    const totalAttempts = concept.correct_count + concept.wrong_count;
                    const accuracy = totalAttempts > 0 ? Math.round((concept.correct_count / totalAttempts) * 100) : 0;

                    return (
                      <div
                        key={concept.id}
                        className={`group rounded-xl border bg-card p-4 transition-colors cursor-pointer relative ${
                          isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/60 hover:border-border hover:shadow-sm'
                        }`}
                        onClick={() => { if (selectionMode) toggleSelection(concept.id); }}
                      >
                        <div className="flex items-start gap-3">
                          {selectionMode && (
                            <div className="pt-0.5 shrink-0" onClick={e => { e.stopPropagation(); toggleSelection(concept.id); }}>
                              <Checkbox checked={isSelected} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${si.color}`}>
                                {si.label}
                              </span>
                              {concept.state !== 0 && (
                                <span className="text-[10px] text-muted-foreground">{nextReviewLabel(concept.scheduled_date)}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-foreground leading-snug">{concept.name}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              {concept.category ? (
                                <span>{concept.category}{concept.subcategory ? ` › ${concept.subcategory}` : ''}</span>
                              ) : (
                                <span className="italic">Sem categoria</span>
                              )}
                              {totalAttempts > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{accuracy}% acerto ({concept.correct_count}/{totalAttempts})</span>
                                </>
                              )}
                            </div>
                          </div>

                          {!selectionMode && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setDeleteSingleTarget(concept); setDeleteConfirmOpen(true); }}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* ═══ Oficiais Tab ═══ */}
          <TabsContent value="oficiais" className="mt-3">
            <OficiaisTab />
          </TabsContent>

          {/* ═══ Comunidade Tab ═══ */}
          <TabsContent value="comunidade" className="mt-3">
            <ComunidadeTab />
          </TabsContent>
        </Tabs>
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
              <Select value={editCategory || '__none__'} onValueChange={v => { setEditCategory(v === '__none__' ? '' : v); setEditSubcategory(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {MEDICAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editCategory && CATEGORY_SUBCATEGORIES[editCategory] && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Especialidade</label>
                <Select value={editSubcategory || '__none__'} onValueChange={v => setEditSubcategory(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Geral</SelectItem>
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
      <Dialog open={deleteConfirmOpen} onOpenChange={o => { if (!o) { setDeleteConfirmOpen(false); setDeleteSingleTarget(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir {deleteSingleTarget ? 'conceito' : `${selectedIds.size} conceitos`}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteSingleTarget ? (
              <>Tem certeza que deseja excluir <span className="font-semibold text-foreground">"{deleteSingleTarget.name}"</span>?</>
            ) : (
              <>Tem certeza que deseja excluir <span className="font-semibold text-foreground">{selectedIds.size} conceitos</span> selecionados?</>
            )}
            {' '}Os vínculos com questões serão removidos, mas as questões não serão afetadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setDeleteSingleTarget(null); }}>Cancelar</Button>
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
                      {q.deckName && <p className="text-[10px] text-muted-foreground mt-0.5">Baralho: {q.deckName}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" title="Adicionar conceito" onClick={() => openAddConcept(q.id)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" title="Desvincular" onClick={() => handleUnlink(q.id)}>
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ─── Add Concept to Question Dialog ─── */}
      <Dialog open={addConceptOpen} onOpenChange={o => { if (!o) setAddConceptOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular conceito à questão</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Adicione esta questão a um conceito adicional (ex: uma questão de Clínica Médica que também serve para Oftalmologia).
          </p>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do conceito</label>
              <Input value={addConceptName} onChange={e => setAddConceptName(e.target.value)} placeholder="Ex: Hipertensão intracraniana" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Grande Área (opcional)</label>
              <Select value={addConceptCategory || '__none__'} onValueChange={v => { setAddConceptCategory(v === '__none__' ? '' : v); setAddConceptSubcategory(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar área..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {MEDICAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {addConceptCategory && CATEGORY_SUBCATEGORIES[addConceptCategory] && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Especialidade</label>
                <Select value={addConceptSubcategory || '__none__'} onValueChange={v => setAddConceptSubcategory(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Geral</SelectItem>
                    {CATEGORY_SUBCATEGORIES[addConceptCategory].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddConceptOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddConcept} disabled={!addConceptName.trim() || addConceptSaving}>
              {addConceptSaving ? 'Vinculando...' : 'Vincular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

export default ConceptsPage;
