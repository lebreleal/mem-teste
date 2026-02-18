import { useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamDetail, useExams } from '@/hooks/useExams';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Sparkles, Brain, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { parseExamOptions } from '@/lib/examUtils';

const ExamResults = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { exam, questions, isLoading, gradeWritten } = useExamDetail(examId ?? '');
  const { restartExam } = useExams();
  const [gradingId, setGradingId] = useState<string | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s.toString().padStart(2, '0')}s`;
  };

  const handleGradeWritten = async (q: any) => {
    if (!q.user_answer) {
      toast({ title: 'Sem resposta para corrigir', variant: 'destructive' });
      return;
    }
    setGradingId(q.id);
    try {
      const result = await gradeWritten.mutateAsync({
        questionId: q.id,
        userAnswer: q.user_answer,
        correctAnswer: q.correct_answer,
        questionText: q.question_text,
      });
      toast({
        title: `Nota: ${Math.round((result.scored / q.points) * 100)}%`,
        description: result.freeGradingsRemaining > 0
          ? `${result.freeGradingsRemaining} correções gratuitas restantes hoje`
          : 'Próximas correções custarão 2 Créditos IA',
      });
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao corrigir', variant: 'destructive' });
    } finally {
      setGradingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="font-display text-2xl font-bold">Prova não encontrada</h1>
        <Button variant="outline" onClick={() => navigate('/dashboard')} className="mt-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const timeTaken = exam.completed_at && exam.started_at
    ? Math.floor((new Date(exam.completed_at).getTime() - new Date(exam.started_at).getTime()) / 1000)
    : 0;

  const totalPoints = exam.total_points || 1;
  const scoredPoints = exam.scored_points || 0;
  const percentage = Math.round((scoredPoints / totalPoints) * 100);
  const ungradedWritten = questions.filter(q => q.question_type === 'written' && !q.is_graded).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="gap-1 text-muted-foreground px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-display text-sm font-bold text-foreground">Resultados</h1>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="container mx-auto px-4 py-6 max-w-2xl space-y-6 pb-12">
          {/* Score summary */}
          <div className="card-premium border border-border/40 bg-card p-6 text-center" style={{ borderRadius: 'var(--radius)' }}>
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(timeTaken)}
              </div>
            </div>
            <div className={`text-5xl font-display font-black mb-1 ${
              percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-destructive'
            }`}>
              {percentage}%
            </div>
            <p className="text-sm text-muted-foreground">
              {scoredPoints.toFixed(1)}/{totalPoints.toFixed(1)} pontos
            </p>
            <Progress value={percentage} className="mt-4 h-2" />
            {ungradedWritten > 0 && (
              <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning font-semibold">
                <Brain className="inline h-3.5 w-3.5 mr-1" />
                {ungradedWritten} {ungradedWritten === 1 ? 'questão dissertativa' : 'questões dissertativas'} não corrigida{ungradedWritten > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Questions */}
          {questions.map((q, idx) => {
            const isMC = q.question_type === 'multiple_choice' || q.question_type === 'multi_select';
            const options = parseExamOptions(q.options);
            const correctIndices = q.correct_indices || [];
            const selectedIndices = q.selected_indices || [];

            return (
              <div key={q.id} className="card-premium border border-border/40 bg-card p-5" style={{ borderRadius: 'var(--radius)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          q.question_type === 'written' ? 'text-warning' : 'text-primary'
                        }`}>
                          {q.question_type === 'written' ? 'Dissertativa' : 'Múltipla escolha'}
                        </span>
                      </div>
                      <div className="prose prose-sm max-w-none text-card-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                    </div>
                  </div>
                  <span className={`text-xs font-bold rounded-lg px-2 py-1 ${
                    q.is_graded
                      ? q.scored_points >= q.points * 0.7 ? 'bg-success/10 text-success'
                        : q.scored_points > 0 ? 'bg-warning/10 text-warning'
                        : 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {q.is_graded ? `${q.scored_points.toFixed(1)}/${q.points}` : `0/${q.points}`} pts
                  </span>
                </div>

                {isMC ? (
                  <div className="space-y-2 mt-3">
                    {options.map((opt, optIdx) => {
                      const isCorrect = correctIndices.includes(optIdx);
                      const isSelected = selectedIndices.includes(optIdx);
                      let optClass = 'border-border bg-card opacity-60';
                      if (isCorrect) optClass = 'border-success bg-success/10';
                      else if (isSelected && !isCorrect) optClass = 'border-destructive bg-destructive/10';
                      return (
                        <div key={optIdx} className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3 ${optClass}`}>
                          <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                            isCorrect ? 'border-success bg-success text-white'
                              : isSelected ? 'border-destructive bg-destructive text-white'
                              : 'border-muted-foreground/30'
                          }`}>
                            {isCorrect && <CheckCircle2 className="h-3.5 w-3.5" />}
                            {isSelected && !isCorrect && <XCircle className="h-3.5 w-3.5" />}
                          </div>
                          <span className="text-sm font-medium text-card-foreground">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {q.user_answer ? (
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Sua resposta</span>
                        <p className="text-sm text-foreground">{q.user_answer}</p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                        <p className="text-sm text-muted-foreground italic">Sem resposta</p>
                      </div>
                    )}
                    <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success block mb-1">Resposta esperada</span>
                      <p className="text-sm text-foreground">{q.correct_answer}</p>
                    </div>
                    {q.ai_feedback && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 animate-fade-in">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Feedback IA</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{q.ai_feedback}</p>
                      </div>
                    )}
                    {!q.is_graded && q.user_answer && (
                      <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => handleGradeWritten(q)} disabled={gradingId === q.id}>
                        {gradingId === q.id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {gradingId === q.id ? 'Corrigindo...' : 'Corrigir com IA'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate('/exam/new')} className="flex-1 gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button
              variant="secondary"
              className="flex-1 gap-2"
              onClick={() => {
                restartExam.mutate(examId!, {
                  onSuccess: () => {
                    toast({ title: 'Prova reiniciada!' });
                    navigate(`/exam/${examId}`, { replace: true });
                  },
                  onError: () => toast({ title: 'Erro ao reiniciar', variant: 'destructive' }),
                });
              }}
              disabled={restartExam.isPending}
            >
              <RotateCcw className="h-4 w-4" /> Refazer
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExamResults;
