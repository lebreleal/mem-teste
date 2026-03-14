/**
 * QuestionBank — Browse questions across 3 sources with advanced filters.
 * Concepts are resolved from question_concepts junction, NOT free-text.
 * Own questions can be edited inline.
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import BottomNav from '@/components/BottomNav';
import {
  ArrowLeft, Library, Search, Download, CheckSquare, X, Filter,
  SlidersHorizontal, BookOpen, Users, ShieldCheck, ChevronRight,
  BrainCircuit, FileText, HelpCircle, Pencil, Trash2, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchMyQuestions, fetchPublicQuestions, importQuestionsToDecks,
  filterQuestions, getQuestionStats, updateQuestion, updateQuestionConcepts,
  type BankQuestion, type QuestionSource, type QuestionFilters,
} from '@/services/questionBankService';
import { MEDICAL_CATEGORIES, CATEGORY_SUBCATEGORIES } from '@/services/globalConceptService';

// ═══════════════════════════════════════════════
// Advanced Filter Panel
// ═══════════════════════════════════════════════
interface FilterPanelProps {
  questions: BankQuestion[];
  filters: QuestionFilters;
  onFiltersChange: (f: QuestionFilters) => void;
  onClose: () => void;
}

const FilterPanel = ({ questions, filters, onFiltersChange, onClose }: FilterPanelProps) => {
  const stats = useMemo(() => getQuestionStats(questions), [questions]);

  const set = (key: keyof QuestionFilters, value: any) =>
    onFiltersChange({ ...filters, [key]: value });

  const subcategories = filters.category && filters.category !== '__all__'
    ? CATEGORY_SUBCATEGORIES[filters.category] ?? []
    : [];

  const activeCount = [
    filters.category && filters.category !== '__all__',
    filters.subcategory && filters.subcategory !== '__all__',
    filters.questionType && filters.questionType !== '__all__',
    filters.hasExplanation,
    filters.conceptName,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* ─── Grande Área ─── */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          Grande Área
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { set('category', '__all__'); set('subcategory', '__all__'); }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              !filters.category || filters.category === '__all__'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent border border-border/50'
            }`}
          >
            Todas ({stats.total})
          </button>
          {MEDICAL_CATEGORIES.map(cat => {
            const count = stats.categories.find(([c]) => c === cat)?.[1] ?? 0;
            const isActive = filters.category === cat;
            return (
              <button
                key={cat}
                onClick={() => { set('category', cat); set('subcategory', '__all__'); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent border border-border/50'
                }`}
              >
                {cat.replace('Ginecologia e Obstetrícia', 'GO').replace('Medicina Preventiva', 'Prev.')} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Subcategoria ─── */}
      {subcategories.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">Especialidade</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => set('subcategory', '__all__')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                !filters.subcategory || filters.subcategory === '__all__'
                  ? 'bg-primary/80 text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent border border-border/50'
              }`}
            >
              Todas
            </button>
            {subcategories.map(sub => {
              const count = stats.subcategories.find(([s]) => s === sub)?.[1] ?? 0;
              return (
                <button
                  key={sub}
                  onClick={() => set('subcategory', sub)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filters.subcategory === sub
                      ? 'bg-primary/80 text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent border border-border/50'
                  }`}
                >
                  {sub} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Tipo de questão ─── */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
          Tipo de Questão
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: '__all__', label: 'Todas' },
            { value: 'multiple_choice', label: 'Múltipla escolha' },
            { value: 'written', label: 'Dissertativa' },
            { value: 'true_false', label: 'V ou F' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => set('questionType', opt.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                (filters.questionType ?? '__all__') === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent border border-border/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Com explicação ─── */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Apenas com comentário/explicação</span>
        </div>
        <Switch
          checked={!!filters.hasExplanation}
          onCheckedChange={v => set('hasExplanation', v)}
        />
      </div>

      {/* ─── Conceitos mais usados (nuvem) ─── */}
      {stats.topConcepts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <BrainCircuit className="h-3.5 w-3.5 text-primary" />
            Conceitos mais frequentes
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {stats.topConcepts.map(([name, count]) => {
              const isActive = filters.conceptName === name;
              return (
                <button
                  key={name}
                  onClick={() => set('conceptName', isActive ? '' : name)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {name} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        {activeCount > 0 ? (
          <button
            onClick={() => onFiltersChange({ search: filters.search })}
            className="text-xs text-primary hover:underline"
          >
            Limpar {activeCount} filtro{activeCount > 1 ? 's' : ''}
          </button>
        ) : (
          <span />
        )}
        <Button size="sm" onClick={onClose}>Aplicar</Button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════
// Question Edit Dialog
// ═══════════════════════════════════════════════
interface QuestionEditDialogProps {
  question: BankQuestion | null;
  open: boolean;
  onClose: () => void;
  userId: string;
}

const QuestionEditDialog = ({ question, open, onClose, userId }: QuestionEditDialogProps) => {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [correctIndices, setCorrectIndices] = useState<number[]>([]);
  const [conceptInput, setConceptInput] = useState('');
  const [concepts, setConcepts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Sync state when question changes
  useState(() => {
    if (question) {
      setText(question.question_text);
      setExplanation(question.explanation);
      const opts = Array.isArray(question.options)
        ? question.options.map((o: any) => typeof o === 'string' ? o : JSON.stringify(o))
        : [];
      setOptions(opts);
      setCorrectIndices(question.correct_indices ?? []);
      setConcepts([...question.concepts]);
    }
  });

  // Re-sync when dialog opens with new question
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && question) {
      setText(question.question_text);
      setExplanation(question.explanation);
      const opts = Array.isArray(question.options)
        ? question.options.map((o: any) => typeof o === 'string' ? o : JSON.stringify(o))
        : [];
      setOptions(opts);
      setCorrectIndices(question.correct_indices ?? []);
      setConcepts([...question.concepts]);
    }
    if (!isOpen) onClose();
  };

  const addConcept = () => {
    const trimmed = conceptInput.trim();
    if (trimmed && !concepts.includes(trimmed)) {
      setConcepts([...concepts, trimmed]);
      setConceptInput('');
    }
  };

  const removeConcept = (name: string) => {
    setConcepts(concepts.filter(c => c !== name));
  };

  const toggleCorrect = (idx: number) => {
    setCorrectIndices(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const updateOption = (idx: number, value: string) => {
    setOptions(prev => prev.map((o, i) => i === idx ? value : o));
  };

  const addOption = () => setOptions([...options, '']);

  const removeOption = (idx: number) => {
    setOptions(prev => prev.filter((_, i) => i !== idx));
    setCorrectIndices(prev => prev.filter(i => i !== idx).map(i => i > idx ? i - 1 : i));
  };

  const handleSave = async () => {
    if (!question) return;
    setSaving(true);
    try {
      await updateQuestion(question.id, {
        question_text: text,
        explanation,
        options: question.question_type === 'multiple_choice' ? options : undefined,
        correct_indices: question.question_type === 'multiple_choice' ? correctIndices : undefined,
      });

      await updateQuestionConcepts(
        userId,
        question.id,
        concepts,
        question.category ?? undefined,
        question.subcategory ?? undefined,
      );

      toast.success('Questão atualizada');
      queryClient.invalidateQueries({ queryKey: ['question-bank'] });
      onClose();
    } catch {
      toast.error('Erro ao salvar questão');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Editar Questão
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Question text */}
          <div>
            <Label className="text-xs font-semibold">Enunciado</Label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Options (multiple choice) */}
          {question?.question_type === 'multiple_choice' && (
            <div>
              <Label className="text-xs font-semibold">Alternativas</Label>
              <div className="space-y-2 mt-1">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Checkbox
                      checked={correctIndices.includes(i)}
                      onCheckedChange={() => toggleCorrect(i)}
                      className="shrink-0"
                    />
                    <span className="text-xs font-bold text-muted-foreground w-5">{String.fromCharCode(65 + i)}.</span>
                    <Input
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                      className="flex-1 h-8 text-sm"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeOption(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addOption}>
                  <Plus className="h-3 w-3" /> Alternativa
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Marque as alternativas corretas.</p>
            </div>
          )}

          {/* Explanation */}
          <div>
            <Label className="text-xs font-semibold">Explicação / Comentário</Label>
            <Textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Concepts */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <BrainCircuit className="h-3.5 w-3.5 text-primary" />
              Conceitos vinculados
            </Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {concepts.map(c => (
                <Badge key={c} variant="secondary" className="gap-1 text-[10px]">
                  {c}
                  <button onClick={() => removeConcept(c)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              {concepts.length === 0 && (
                <span className="text-[10px] text-muted-foreground italic">Nenhum conceito vinculado</span>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={conceptInput}
                onChange={e => setConceptInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addConcept())}
                placeholder="Nome do conceito..."
                className="h-8 text-sm flex-1"
              />
              <Button variant="outline" size="sm" className="h-8" onClick={addConcept} disabled={!conceptInput.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════
// Question List Item
// ═══════════════════════════════════════════════
const QuestionItem = ({
  question, isSelected, onToggle, onEdit,
}: { question: BankQuestion; isSelected: boolean; onToggle: () => void; onEdit?: () => void }) => {
  const plainText = question.question_text.replace(/<[^>]+>/g, '');

  return (
    <div
      className={`w-full text-left rounded-xl border p-3.5 space-y-2 transition-colors ${
        isSelected
          ? 'border-primary/50 bg-primary/5'
          : 'border-border/50 bg-card hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          checked={isSelected}
          className="mt-0.5 shrink-0"
          onCheckedChange={onToggle}
        />
        <div className="flex-1 min-w-0" onClick={onToggle}>
          <p className="text-sm text-foreground line-clamp-3 leading-relaxed cursor-pointer">{plainText}</p>

          {/* Options preview */}
          {question.question_type === 'multiple_choice' && Array.isArray(question.options) && question.options.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {(question.options as string[]).slice(0, 4).map((opt, i) => (
                <p key={i} className="text-[11px] text-muted-foreground line-clamp-1">
                  <span className="font-semibold text-foreground/70">{String.fromCharCode(65 + i)}.</span> {typeof opt === 'string' ? opt : JSON.stringify(opt)}
                </p>
              ))}
            </div>
          )}

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{question.deck_name}</span>
            {question.turma_name && (
              <>
                <span className="text-[10px] text-border">·</span>
                <span className="text-[10px] text-muted-foreground">{question.turma_name}</span>
              </>
            )}
            {question.category && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{question.category}</Badge>
            )}
            {question.subcategory && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{question.subcategory}</Badge>
            )}
            {question.explanation && question.explanation.trim().length > 10 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                Comentado
              </Badge>
            )}
          </div>

          {/* Concepts (only real linked ones) */}
          {question.concepts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {question.concepts.slice(0, 4).map(c => (
                <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c}</span>
              ))}
              {question.concepts.length > 4 && (
                <span className="text-[9px] text-muted-foreground">+{question.concepts.length - 4}</span>
              )}
            </div>
          )}
        </div>

        {/* Edit button for own questions */}
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════
// Tab Content Component
// ═══════════════════════════════════════════════
const QuestionTabContent = ({
  source, questions, isLoading, userId,
}: { source: QuestionSource; questions: BankQuestion[]; isLoading: boolean; userId: string }) => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<QuestionFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<BankQuestion | null>(null);

  const filtered = useMemo(() => filterQuestions(questions, filters), [questions, filters]);
  const stats = useMemo(() => getQuestionStats(questions), [questions]);

  const activeFilterCount = [
    filters.category && filters.category !== '__all__',
    filters.subcategory && filters.subcategory !== '__all__',
    filters.questionType && filters.questionType !== '__all__',
    filters.hasExplanation,
    filters.conceptName,
  ].filter(Boolean).length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(q => q.id)));
  }, [filtered, selectedIds]);

  const handleImport = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const selected = questions.filter(q => selectedIds.has(q.id));
      const result = await importQuestionsToDecks(userId, selected);
      toast.success(`${result.questionCount} questões importadas — ${result.deckCount} baralho(s), ${result.cardCount} cards`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
    } catch {
      toast.error('Erro ao importar questões');
    } finally {
      setImporting(false);
    }
  }, [userId, selectedIds, questions, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const emptyIcon = source === 'my' ? BookOpen : source === 'official' ? ShieldCheck : Users;
  const EmptyIcon = emptyIcon;

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center mt-4">
        <EmptyIcon className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <h3 className="font-display text-base font-semibold text-foreground">
          {source === 'my' ? 'Nenhuma questão ainda' : 'Nenhuma questão disponível'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs">
          {source === 'my'
            ? 'Crie questões nos seus baralhos ou importe das abas Oficiais e Comunidade.'
            : source === 'official'
              ? 'Questões oficiais da plataforma aparecerão aqui.'
              : 'Questões de comunidades públicas aparecerão aqui.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-3">
      {/* Search + Filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search ?? ''}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Buscar questão, conceito..."
            className="pl-9"
          />
        </div>
        <Button
          variant={activeFilterCount > 0 ? 'secondary' : 'outline'}
          size="icon"
          className="relative shrink-0"
          onClick={() => setShowFilters(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.category && filters.category !== '__all__' && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              {filters.category}
              <button onClick={() => setFilters(f => ({ ...f, category: '__all__', subcategory: '__all__' }))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          )}
          {filters.subcategory && filters.subcategory !== '__all__' && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              {filters.subcategory}
              <button onClick={() => setFilters(f => ({ ...f, subcategory: '__all__' }))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          )}
          {filters.conceptName && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              Conceito: {filters.conceptName}
              <button onClick={() => setFilters(f => ({ ...f, conceptName: '' }))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          )}
          {filters.hasExplanation && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              Com explicação
              <button onClick={() => setFilters(f => ({ ...f, hasExplanation: false }))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          )}
          {filters.questionType && filters.questionType !== '__all__' && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              {filters.questionType === 'multiple_choice' ? 'Múltipla escolha' : filters.questionType === 'written' ? 'Dissertativa' : filters.questionType}
              <button onClick={() => setFilters(f => ({ ...f, questionType: '__all__' }))}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filtered.length} questão{filtered.length !== 1 ? 'ões' : ''}{activeFilterCount > 0 ? ` (de ${questions.length})` : ''}
        </p>
        <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-xs">
          {selectedIds.size === filtered.length && filtered.length > 0 ? 'Desmarcar tudo' : 'Selecionar tudo'}
        </Button>
      </div>

      {/* Selection action bar */}
      {selectedIds.size > 0 && source !== 'my' && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground flex-1">
            {selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-7 px-2">
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={handleImport} disabled={importing} className="h-7 gap-1">
            <Download className="h-3.5 w-3.5" />
            {importing ? 'Importando...' : 'Importar'}
          </Button>
        </div>
      )}

      {/* Question list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground/20 mb-2" />
          <p className="text-sm font-medium text-foreground">Nenhuma questão encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Tente ajustar os filtros ou busca.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(q => (
            <QuestionItem
              key={q.id}
              question={q}
              isSelected={selectedIds.has(q.id)}
              onToggle={() => toggleSelect(q.id)}
              onEdit={q.is_own ? () => setEditingQuestion(q) : undefined}
            />
          ))}
        </div>
      )}

      {/* Filter Sheet */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Filtros avançados
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="mt-4 max-h-[60vh] pr-2">
            <FilterPanel
              questions={questions}
              filters={filters}
              onFiltersChange={setFilters}
              onClose={() => setShowFilters(false)}
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <QuestionEditDialog
        question={editingQuestion}
        open={!!editingQuestion}
        onClose={() => setEditingQuestion(null)}
        userId={userId}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════
// Main QuestionBank Page
// ═══════════════════════════════════════════════
const QuestionBank = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<QuestionSource>('my');

  const myQuery = useQuery({
    queryKey: ['question-bank', 'my', user?.id],
    queryFn: () => fetchMyQuestions(user!.id),
    enabled: !!user && activeTab === 'my',
    staleTime: 60_000,
  });

  const officialQuery = useQuery({
    queryKey: ['question-bank', 'official'],
    queryFn: () => fetchPublicQuestions('official'),
    enabled: !!user && activeTab === 'official',
    staleTime: 120_000,
  });

  const communityQuery = useQuery({
    queryKey: ['question-bank', 'community'],
    queryFn: () => fetchPublicQuestions('community'),
    enabled: !!user && activeTab === 'community',
    staleTime: 60_000,
  });

  const getQueryForTab = (tab: QuestionSource) => {
    switch (tab) {
      case 'my': return myQuery;
      case 'official': return officialQuery;
      case 'community': return communityQuery;
    }
  };

  const currentQuery = getQueryForTab(activeTab);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-card/95 backdrop-blur-md px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Banco de Questões
          </h1>
          <p className="text-xs text-muted-foreground">
            {currentQuery.data?.length ?? 0} questões{activeTab === 'my' ? ' pessoais' : activeTab === 'official' ? ' oficiais' : ' da comunidade'}
          </p>
        </div>
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto">
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as QuestionSource)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="my" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Minhas
            </TabsTrigger>
            <TabsTrigger value="official" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              Oficiais
            </TabsTrigger>
            <TabsTrigger value="community" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Comunidade
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my">
            <QuestionTabContent
              source="my"
              questions={myQuery.data ?? []}
              isLoading={myQuery.isLoading}
              userId={user?.id ?? ''}
            />
          </TabsContent>

          <TabsContent value="official">
            <QuestionTabContent
              source="official"
              questions={officialQuery.data ?? []}
              isLoading={officialQuery.isLoading}
              userId={user?.id ?? ''}
            />
          </TabsContent>

          <TabsContent value="community">
            <QuestionTabContent
              source="community"
              questions={communityQuery.data ?? []}
              isLoading={communityQuery.isLoading}
              userId={user?.id ?? ''}
            />
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default QuestionBank;
