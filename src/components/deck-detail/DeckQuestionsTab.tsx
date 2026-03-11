import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, PenLine, FileUp, Brain, PlayCircle, SquarePen, Trophy, Clock3 } from 'lucide-react';

type ExamItem = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  scored_points: number;
  total_points: number;
  time_limit_seconds: number | null;
};

const DeckQuestionsTab = ({ deckId }: { deckId: string }) => {
  const navigate = useNavigate();

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['deck-exams', deckId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, status, created_at, scored_points, total_points, time_limit_seconds')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExamItem[];
    },
    enabled: !!deckId,
    staleTime: 30_000,
  });

  const actions = useMemo(
    () => [
      {
        title: 'Criar manualmente',
        desc: 'Escreva questões e respostas do seu jeito.',
        icon: PenLine,
        onClick: () => navigate(`/exam/new/create?deckId=${deckId}&mode=manual`),
      },
      {
        title: 'IA com este deck (Flash)',
        desc: 'Rápida e econômica, baseada nos cards.',
        icon: Sparkles,
        onClick: () => navigate(`/exam/new/create?deckId=${deckId}&mode=ai&model=flash`),
      },
      {
        title: 'IA com este deck (Pro)',
        desc: 'Mais qualidade de raciocínio e profundidade.',
        icon: Brain,
        onClick: () => navigate(`/exam/new/create?deckId=${deckId}&mode=ai&model=pro`),
      },
      {
        title: 'IA via arquivo',
        desc: 'Importe PDF/DOCX/PPTX/TXT e gere questões.',
        icon: FileUp,
        onClick: () => navigate(`/exam/new/create?deckId=${deckId}&mode=file`),
      },
    ],
    [deckId, navigate]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action.title}
            onClick={action.onClick}
            className="rounded-2xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <action.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-bold text-foreground">{action.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{action.desc}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-foreground">Questões já criadas</h3>
          <Badge variant="secondary">{exams.length}</Badge>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando questões...</div>
        ) : exams.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma questão criada para este deck ainda.</div>
        ) : (
          <div className="space-y-2">
            {exams.map((exam) => (
              <div key={exam.id} className="rounded-xl border border-border/50 bg-background px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{exam.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" /> {exam.scored_points}/{exam.total_points}</span>
                      {exam.time_limit_seconds ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {Math.floor(exam.time_limit_seconds / 60)} min</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/exam/${exam.id}/edit`)}>
                      <SquarePen className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => navigate(`/exam/${exam.id}`)}>
                      <PlayCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeckQuestionsTab;
