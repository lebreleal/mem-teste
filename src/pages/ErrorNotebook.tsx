/**
 * ErrorNotebook — Global "Caderno de Erros" page.
 * Shows all wrong questions across all decks with practice mode.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookX, PlayCircle, ChevronRight } from 'lucide-react';
import { lazy, Suspense } from 'react';

const DeckQuestionsTab = lazy(() => import('@/components/deck-detail/DeckQuestionsTab'));

interface ErrorQuestion {
  id: string;
  deck_id: string;
  question_text: string;
  options: string[];
  correct_indices: number[] | null;
  explanation: string;
  concepts: string[];
  deck_name: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const ErrorNotebook = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Get all user's wrong attempts (latest per question)
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

      // 2. Get latest attempt per question
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

      return (questions as any[]).map((q: any) => ({
        id: q.id,
        deck_id: q.deck_id,
        question_text: q.question_text,
        options: Array.isArray(q.options) ? q.options : [],
        correct_indices: q.correct_indices,
        explanation: q.explanation || '',
        concepts: Array.isArray(q.concepts) ? q.concepts : [],
        deck_name: deckMap.get(q.deck_id) || 'Baralho',
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
            {/* Summary stats */}
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

            {/* Grouped by deck */}
            {groupedByDeck.map(([deckId, { name, questions }]) => (
              <div key={deckId} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-foreground">{name}</h3>
                  <Badge variant="destructive" className="text-[10px]">{questions.length} erros</Badge>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => navigate(`/decks/${deckId}`, { state: { tab: 'questions', filter: 'errors' } })}
                >
                  <PlayCircle className="h-4 w-4" /> Revisar erros deste baralho
                  <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                </Button>

                <div className="space-y-1.5">
                  {questions.slice(0, 5).map((q, idx) => {
                    const plainText = q.question_text.replace(/<[^>]+>/g, '');
                    return (
                      <div key={q.id} className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                        <p className="text-xs text-foreground line-clamp-2">
                          {idx + 1}. {plainText}
                        </p>
                        {q.concepts.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {q.concepts.map(c => (
                              <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c}</span>
                            ))}
                          </div>
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
