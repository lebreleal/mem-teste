/**
 * QuestionBank — Browse public questions from Official & Community sources.
 * Supports filtering, search, and bulk import to user's decks.
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Library, Search, Download, CheckSquare, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { fetchPublicQuestions, importQuestionsToDecks, type BankQuestion } from '@/services/questionBankService';
import { MEDICAL_CATEGORIES } from '@/services/globalConceptService';

const QuestionBank = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('__all__');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['question-bank', 'community'],
    queryFn: () => fetchPublicQuestions('community'),
    enabled: !!user,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    let list = questions;
    if (categoryFilter && categoryFilter !== '__all__') {
      list = list.filter(q => q.category === categoryFilter);
    }
    if (search.trim()) {
      const lower = search.toLowerCase();
      list = list.filter(q =>
        q.question_text.toLowerCase().includes(lower) ||
        q.concepts.some(c => c.toLowerCase().includes(lower)) ||
        q.deck_name.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [questions, categoryFilter, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(q => q.id)));
    }
  }, [filtered, selectedIds]);

  const handleImport = useCallback(async () => {
    if (!user || selectedIds.size === 0) return;
    setImporting(true);
    try {
      const selected = questions.filter(q => selectedIds.has(q.id));
      const result = await importQuestionsToDecks(user.id, selected);
      toast({
        title: `${result.questionCount} questões importadas!`,
        description: `${result.deckCount} baralho(s) criado(s), ${result.cardCount} cards de revisão gerados.`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['global-concepts'] });
    } catch (err) {
      toast({ title: 'Erro ao importar', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }, [user, selectedIds, questions, queryClient]);

  const categories = useMemo(() => {
    const cats = new Set(questions.map(q => q.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [questions]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <Library className="h-5 w-5 text-primary" />
              Banco de Questões
            </h1>
            <p className="text-xs text-muted-foreground">
              {questions.length} questões disponíveis
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Search + Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar questão, conceito ou baralho..."
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as áreas</SelectItem>
              {MEDICAL_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
              {categories.filter(c => !(MEDICAL_CATEGORIES as readonly string[]).includes(c)).map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selection bar */}
        {selectedIds.size > 0 && (
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

        {/* Questions */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16 text-center">
            <Library className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="font-display text-base font-semibold text-foreground">
              {questions.length === 0 ? 'Nenhuma questão disponível' : 'Nenhuma questão encontrada'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              {questions.length === 0
                ? 'As questões de comunidades públicas aparecerão aqui.'
                : 'Tente ajustar os filtros ou busca.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{filtered.length} resultados</p>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-xs">
                {selectedIds.size === filtered.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </Button>
            </div>

            {filtered.map((q, idx) => {
              const plainText = q.question_text.replace(/<[^>]+>/g, '');
              const isSelected = selectedIds.has(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => toggleSelect(q.id)}
                  className={`w-full text-left rounded-xl border p-3 space-y-1.5 transition-colors ${
                    isSelected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/50 bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={isSelected}
                      className="mt-0.5 shrink-0"
                      onCheckedChange={() => toggleSelect(q.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">{plainText}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{q.deck_name}</span>
                        {q.turma_name && (
                          <>
                            <span className="text-[10px] text-border">·</span>
                            <span className="text-[10px] text-muted-foreground">{q.turma_name}</span>
                          </>
                        )}
                        {q.category && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{q.category}</Badge>
                        )}
                        {q.concepts.slice(0, 3).map(c => (
                          <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default QuestionBank;
