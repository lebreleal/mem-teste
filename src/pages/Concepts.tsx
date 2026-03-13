/**
 * ConceptsPage — Global concept library with 3 tabs: Meus, Oficiais, Comunidade.
 * Sub-components extracted to src/components/concepts/.
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import type { GlobalConcept } from '@/services/globalConceptService';
import {
  MEDICAL_CATEGORIES, CATEGORY_SUBCATEGORIES, getConceptQuestions,
  fetchOfficialConcepts, fetchCommunityConcepts, importConcept, importConceptWithContent,
  mapPrerequisitesViaAI, fetchDiagnosticConcepts,
} from '@/services/globalConceptService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BottomNav from '@/components/BottomNav';
import {
  BrainCircuit, ArrowLeft, Search, Play, Clock, Zap,
  X as XIcon, Trash2, MoreVertical,
  CheckCheck, Filter, Download, Users, ShieldCheck,
  Wand2, Stethoscope,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Rating } from '@/lib/fsrs';

import type { StateFilter } from '@/components/concepts/helpers';
import DiagnosticMode from '@/components/concepts/DiagnosticMode';
import StudyMode from '@/components/concepts/StudyMode';
import CategoryDonutChart from '@/components/concepts/CategoryDonutChart';
// ReadyToLearnSection is now integrated into ConceptGroupedList
import ConceptListItem from '@/components/concepts/ConceptListItem';
import ConceptGroupedList from '@/components/concepts/ConceptGroupedList';
import { EditConceptDialog, DeleteConceptDialog, QuestionsSheet, AddConceptDialog } from '@/components/concepts/ConceptDialogs';

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
      await importConcept(user.id, { name: concept.name, conceptTagId: concept.id });
      toast.success(`"${concept.name}" adicionado aos seus temas`);
    } catch { toast.error('Erro ao importar tema'); }
    setImporting(null);
  };

  if (isLoading) return <div className="space-y-3 p-1"><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /></div>;

  if (officialConcepts.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
      <ShieldCheck className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
      <h3 className="font-display text-lg font-semibold text-foreground">Nenhum tema oficial ainda</h3>
      <p className="mt-1 text-sm text-muted-foreground">Temas oficiais da plataforma aparecerão aqui.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {officialConcepts.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar temas oficiais" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      )}
      <div className="space-y-2">
        {filtered.map(concept => (
          <div key={concept.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{concept.name}</p>
              {concept.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{concept.description}</p>}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={importing === concept.id} onClick={() => handleImport(concept)}>
              <Download className="h-3.5 w-3.5" />{importing === concept.id ? 'Adicionando...' : 'Adicionar'}
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
    return communityConcepts.filter(c => c.name.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q));
  }, [communityConcepts, search]);

  const handleImportWithContent = async (concept: GlobalConcept) => {
    if (!user) return;
    setImporting(concept.id);
    try {
      const result = await importConceptWithContent(user.id, concept.id, {
        name: concept.name, category: concept.category ?? undefined, subcategory: concept.subcategory ?? undefined,
      });
      toast.success(`"${concept.name}" importado: ${result.questionCount} questões, ${result.cardCount} cards`);
    } catch { toast.error('Erro ao importar tema'); }
    setImporting(null);
  };

  if (isLoading) return <div className="space-y-3 p-1"><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /></div>;

  if (communityConcepts.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
      <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
      <h3 className="font-display text-lg font-semibold text-foreground">Nenhum tema na comunidade</h3>
      <p className="mt-1 text-sm text-muted-foreground">Temas compartilhados por outros usuários aparecerão aqui.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {communityConcepts.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar temas da comunidade" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={importing === concept.id} onClick={() => handleImportWithContent(concept)}>
                <Download className="h-3.5 w-3.5" />{importing === concept.id ? 'Importando...' : 'Importar'}
              </Button>
            </div>
          );
        })}
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
  const { concepts, dueConcepts, isLoading, submitConceptReview, updateMeta, deleteConcept, unlinkQuestion } = useGlobalConcepts();
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
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit dialog
  const [editConcept, setEditConcept] = useState<GlobalConcept | null>(null);

  // Questions sheet
  const [questionsConceptId, setQuestionsConceptId] = useState<string | null>(null);
  const [linkedQuestions, setLinkedQuestions] = useState<{ id: string; questionText: string; deckId: string; deckName?: string }[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Add concept dialog
  const [addConceptOpen, setAddConceptOpen] = useState(false);
  const [addConceptQuestionId, setAddConceptQuestionId] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<GlobalConcept | null>(null);

  // Study mode
  const [studyMode, setStudyMode] = useState(false);
  const [studyQueue, setStudyQueue] = useState<GlobalConcept[]>([]);

  const now = useMemo(() => new Date(), []);
  const isDue = useCallback((c: GlobalConcept) => new Date(c.scheduled_date) <= now, [now]);

  const counts = useMemo(() => ({
    total: concepts.length,
    due: concepts.filter(isDue).length,
    new: concepts.filter(c => c.state === 0).length,
    learning: concepts.filter(c => c.state === 1 || c.state === 3).length,
    mastered: concepts.filter(c => c.state === 2).length,
  }), [concepts, isDue]);

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
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q) || (c.subcategory ?? '').toLowerCase().includes(q));
    }
    if (categoryFilter) result = result.filter(c => c.category === categoryFilter);
    if (stateFilter === 'due') result = result.filter(isDue);
    if (stateFilter === 'new') result = result.filter(c => c.state === 0);
    if (stateFilter === 'learning') result = result.filter(c => c.state === 1 || c.state === 3);
    if (stateFilter === 'mastered') result = result.filter(c => c.state === 2);
    return result;
  }, [concepts, search, stateFilter, categoryFilter, isDue]);

  const hasActiveFilter = stateFilter !== 'all' || !!categoryFilter;

  // ── Handlers ──

  const handleMapPrerequisites = async () => {
    if (!user) return;
    setMappingPrereqs(true);
    try {
      const count = await mapPrerequisitesViaAI(user.id);
      toast.success(`${count} pré-requisito${count !== 1 ? 's' : ''} mapeado${count !== 1 ? 's' : ''} automaticamente`);
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
      queryClient.invalidateQueries({ queryKey: ['ready-to-learn'] });
    } catch (e: any) { toast.error(e?.message || 'Erro ao mapear pré-requisitos'); }
    setMappingPrereqs(false);
  };

  const handleStartDiagnostic = async () => {
    if (!user) return;
    setDiagnosticLoading(true);
    try {
      const queue = await fetchDiagnosticConcepts(user.id);
      if (queue.length === 0) { toast.error('Nenhum tema disponível para diagnóstico'); setDiagnosticLoading(false); return; }
      setDiagnosticQueue(queue);
      setDiagnosticMode(true);
    } catch { toast.error('Erro ao iniciar diagnóstico'); }
    setDiagnosticLoading(false);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(c => c.id)));
  };

  const confirmDelete = async () => {
    if (deleteSingleTarget) {
      await deleteConcept.mutateAsync(deleteSingleTarget.id);
      toast.success('Tema excluído');
    } else {
      const ids = Array.from(selectedIds);
      for (const id of ids) await deleteConcept.mutateAsync(id);
      toast.success(`${ids.length} tema${ids.length > 1 ? 's' : ''} excluído${ids.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
    setDeleteConfirmOpen(false);
    setDeleteSingleTarget(null);
  };

  const openQuestions = async (conceptId: string) => {
    setQuestionsConceptId(conceptId);
    setLoadingQuestions(true);
    try { setLinkedQuestions(await getConceptQuestions(conceptId)); } catch { setLinkedQuestions([]); }
    setLoadingQuestions(false);
  };

  const handleStartStudy = useCallback(async () => {
    if (!user) return;
    const queue = dueConcepts.length > 0 ? dueConcepts : concepts.filter(c => c.state === 0).slice(0, 10);
    if (queue.length === 0) return;
    setStudyQueue(queue);
    setStudyMode(true);
  }, [user, dueConcepts, concepts]);

  const handleStudyRate = useCallback(async (concept: GlobalConcept, rating: Rating, isCorrect: boolean) => {
    await submitConceptReview.mutateAsync({ concept, rating, isCorrect });
  }, [submitConceptReview]);

  const handleStartFrontierStudy = useCallback((concept: GlobalConcept) => {
    setStudyQueue([concept]);
    setStudyMode(true);
  }, []);

  const newPct = counts.total > 0 ? (counts.new / counts.total) * 100 : 0;
  const learningPct = counts.total > 0 ? (counts.learning / counts.total) * 100 : 0;
  const masteredPct = counts.total > 0 ? (counts.mastered / counts.total) * 100 : 0;

  // ── Full-screen modes ──

  if (diagnosticMode && diagnosticQueue.length > 0) {
    return <DiagnosticMode queue={diagnosticQueue} onClose={() => setDiagnosticMode(false)} />;
  }

  if (studyMode && studyQueue.length > 0) {
    return <StudyMode queue={studyQueue} onClose={() => { setStudyMode(false); setStudyQueue([]); }} onRate={handleStudyRate} />;
  }

  // ── Main Page ──
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-card/95 backdrop-blur-md px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            Temas
          </h1>
          <p className="text-xs text-muted-foreground">Seus assuntos de estudo</p>
        </div>
        {activeTab === 'meus' && counts.due > 0 && (
          <Button size="sm" className="gap-1.5" onClick={handleStartStudy}>
            <Play className="h-4 w-4" /> Revisar {counts.due}
          </Button>
        )}
        {activeTab === 'meus' && counts.due === 0 && counts.new > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleStartStudy}>
            <Zap className="h-4 w-4" /> Estudar novos
          </Button>
        )}
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="meus" className="gap-1.5 text-xs"><BrainCircuit className="h-3.5 w-3.5" /> Meus ({counts.total})</TabsTrigger>
            <TabsTrigger value="oficiais" className="gap-1.5 text-xs"><ShieldCheck className="h-3.5 w-3.5" /> Oficiais</TabsTrigger>
            <TabsTrigger value="comunidade" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Comunidade</TabsTrigger>
          </TabsList>

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
                <h3 className="font-display text-lg font-semibold text-foreground">Nenhum tema ainda</h3>
                <p className="mt-1 text-sm text-muted-foreground">Gere questões nos seus baralhos — os temas serão criados automaticamente.</p>
              </div>
            ) : (
              <>
                {/* Title bar */}
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-foreground shrink-0">Temas ({counts.total})</h2>
                  <div className="flex items-center gap-2">
                    <Button variant={hasActiveFilter ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 relative" onClick={() => setShowFilters(!showFilters)}>
                      <Filter className="h-4 w-4" />
                      {hasActiveFilter && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary" />}
                    </Button>
                    <Button variant={selectionMode ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }}>
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
                      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={() => { setDeleteSingleTarget(null); setDeleteConfirmOpen(true); }}>
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
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> <strong className="text-foreground">{counts.new}</strong> Novos</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#47c700' }} /> <strong className="text-foreground">{counts.learning}</strong> Aprendendo</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> <strong className="text-foreground">{counts.mastered}</strong> Dominados</span>
                      {counts.due > 0 && <span className="flex items-center gap-1 text-primary font-medium"><Clock className="h-2.5 w-2.5" /> {counts.due} para revisar</span>}
                    </div>
                  </div>
                )}

                {/* Donut Chart */}
                {!selectionMode && concepts.length >= 3 && (
                  <CategoryDonutChart concepts={concepts} onCategoryClick={setCategoryFilter} />
                )}

                {/* Action Buttons */}
                {!selectionMode && concepts.length >= 2 && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleMapPrerequisites} disabled={mappingPrereqs}>
                      <Wand2 className="h-3.5 w-3.5" />{mappingPrereqs ? 'Mapeando...' : 'Mapear pré-requisitos com IA'}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleStartDiagnostic} disabled={diagnosticLoading}>
                      <Stethoscope className="h-3.5 w-3.5" />{diagnosticLoading ? 'Preparando...' : 'Diagnóstico Inicial'}
                    </Button>
                  </div>
                )}

                {/* Category filter active */}
                {categoryFilter && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      {categoryFilter}
                      <button onClick={() => setCategoryFilter(null)} className="ml-0.5 hover:text-destructive"><XIcon className="h-3 w-3" /></button>
                    </Badge>
                  </div>
                )}

                {/* Search */}
                {counts.total > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Pesquisar temas" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
                      <button onClick={() => { setStateFilter('all'); setCategoryFilter(null); }} className="text-xs text-primary hover:underline">Limpar filtros</button>
                    )}
                  </div>
                )}

                {/* Concept list — grouped by priority sections */}
                <ConceptGroupedList
                  concepts={filtered}
                  lockedIds={lockedIds}
                  allConcepts={concepts}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  onEdit={setEditConcept}
                  onOpenQuestions={openQuestions}
                  onDelete={c => { setDeleteSingleTarget(c); setDeleteConfirmOpen(true); }}
                  onStartStudy={handleStartFrontierStudy}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="oficiais" className="mt-3"><OficiaisTab /></TabsContent>
          <TabsContent value="comunidade" className="mt-3"><ComunidadeTab /></TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <EditConceptDialog
        concept={editConcept}
        onClose={() => setEditConcept(null)}
        onSave={async (name, category, subcategory) => {
          if (!editConcept) return;
          await updateMeta.mutateAsync({ conceptId: editConcept.id, fields: { name, category, subcategory } });
          toast.success('Conceito atualizado');
          setEditConcept(null);
        }}
        isPending={updateMeta.isPending}
      />

      <DeleteConceptDialog
        open={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setDeleteSingleTarget(null); }}
        target={deleteSingleTarget}
        selectedCount={selectedIds.size}
        onConfirm={confirmDelete}
        isPending={deleteConcept.isPending}
      />

      <QuestionsSheet
        conceptId={questionsConceptId}
        questions={linkedQuestions}
        loading={loadingQuestions}
        onClose={() => { setQuestionsConceptId(null); setLinkedQuestions([]); }}
        onUnlink={async (qId) => {
          if (!questionsConceptId) return;
          await unlinkQuestion.mutateAsync({ conceptId: questionsConceptId, questionId: qId });
          setLinkedQuestions(prev => prev.filter(q => q.id !== qId));
          toast.success('Questão desvinculada');
        }}
        onAddConcept={(qId) => { setAddConceptQuestionId(qId); setAddConceptOpen(true); }}
      />

      <AddConceptDialog
        open={addConceptOpen}
        questionId={addConceptQuestionId}
        onClose={() => setAddConceptOpen(false)}
      />

      <BottomNav />
    </div>
  );
};

export default ConceptsPage;
