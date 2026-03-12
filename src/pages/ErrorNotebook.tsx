/**
 * ErrorNotebook — Global "Caderno de Erros" page.
 * Shows wrong questions with linked concepts and related cards for review.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookX, PlayCircle, ChevronRight, BrainCircuit, Layers } from 'lucide-react';

interface ErrorQuestion {
  id: string;
  deck_id: string;
  question_text: string;
  options: string[];
  correct_indices: number[] | null;
  explanation: string;
  concepts: string[];
  deck_name: string;
  linkedConcepts: { id: string; name: string; state: number }[];
  relatedCardCount: number;
}

const STATE_LABELS: Record<number, string> = { 0: 'Novo', 1: 'Aprendendo', 2: 'Dominado', 3: 'Reaprendendo' };
const STATE_COLORS: Record<number, string> = {
  0: 'bg-muted text-muted-foreground',
  1: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  2: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  3: 'bg-destructive/15 text-destructive',
};

const ErrorNotebook = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: errorQuestions = [], isLoading } = useQuery({
    queryKey: ['error-notebook', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // 1. Get all user attempts
      const { data: attempts } = await supabase
        .from('deck_question_attempts' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('answered_at', { ascending: false });

      if (!attempts || attempts.length === 0) return [];

      // 2. Latest attempt per question
      const latestByQ = new Map<string, any>();
      for (const a of attempts as any[]) {
        if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a);
      }

      // 3. Filter wrong ones
      const wrongIds = [...latestByQ.entries()]
        .filter(([_, a]) => !a.is_correct)
        .map(([qId]) => qId);

      if (wrongIds.length === 0) return [];

      // 4. Fetch questions
      const { data: questions } = await supabase
        .from('deck_questions' as any)
        .select('*')
        .in('id', wrongIds);

      if (!questions || questions.length === 0) return [];

      // 5. Fetch deck names
      const deckIds = [...new Set((questions as any[]).map((q: any) => q.deck_id))];
      const { data: decks } = await supabase
        .from('decks')
        .select('id, name')
        .in('id', deckIds);
      const deckMap = new Map((decks ?? []).map((d: any) => [d.id, d.name]));

      // 6. Fetch linked concepts via question_concepts
      const { data: conceptLinks } = await supabase
        .from('question_concepts' as any)
        .select('question_id, concept_id')
        .in('question_id', wrongIds);

      const conceptIds = [...new Set((conceptLinks ?? []).map((l: any) => l.concept_id))];
      let conceptMap = new Map<string, { id: string; name: string; state: number }>();
      if (conceptIds.length > 0) {
        const { data: gc } = await supabase
          .from('global_concepts' as any)
          .select('id, name, state')
          .eq('user_id', user.id)
          .in('id', conceptIds);
        if (gc) {
          for (const c of gc as any[]) {
            conceptMap.set(c.id, { id: c.id, name: c.name, state: c.state });
          }
        }
      }

      // Build question → concepts map
      const qConceptMap = new Map<string, { id: string; name: string; state: number }[]>();
      for (const link of (conceptLinks ?? []) as any[]) {
        const concept = conceptMap.get(link.concept_id);
        if (concept) {
          if (!qConceptMap.has(link.question_id)) qConceptMap.set(link.question_id, []);
          qConceptMap.get(link.question_id)!.push(concept);
        }
      }

      // 7. Count related cards per deck
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
        linkedConcepts: qConceptMap.get(q.id) ?? [],
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
              {errorQuestions.length} {errorQuestions.length === 1 ? 'questão errada' : 'questões erradas'} em {groupedByDeck.length} {groupedByDeck.length === 1 ? 'baralho' : 'baralhos'}
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
              <BookX className="h-8 w-8 text-emerald-500" />
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
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <span className="font-bold text-destructive text-lg">{errorQuestions.length}</span>{' '}
                  questões para revisar
                </div>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                <div className="h-full rounded-full bg-destructive/80 transition-all" style={{ width: '100%' }} />
              </div>
            </div>

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
                  {questions.slice(0, 5).map((q, idx) => {
                    const plainText = q.question_text.replace(/<[^>]+>/g, '');
                    return (
                      <div key={q.id} className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 space-y-1.5">
                        <p className="text-xs text-foreground line-clamp-2">
                          {idx + 1}. {plainText}
                        </p>

                        {/* Linked concepts with mastery */}
                        {q.linkedConcepts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {q.linkedConcepts.map(c => (
                              <span
                                key={c.id}
                                className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATE_COLORS[c.state] ?? STATE_COLORS[0]}`}
                              >
                                <BrainCircuit className="h-2.5 w-2.5" />
                                {c.name}
                                <span className="opacity-60">({STATE_LABELS[c.state] ?? 'Novo'})</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Fallback: text-based concepts */}
                        {q.linkedConcepts.length === 0 && q.concepts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {q.concepts.map(c => (
                              <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c}</span>
                            ))}
                          </div>
                        )}

                        {/* Related cards count */}
                        {q.relatedCardCount > 0 && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Layers className="h-2.5 w-2.5" /> {q.relatedCardCount} cards neste baralho para revisão
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {questions.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{questions.length - 5} mais
                    </p>
                  )}
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
