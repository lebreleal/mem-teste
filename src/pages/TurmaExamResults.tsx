import { useState } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTurmaExamDetail, fetchTurmaExamAttemptForResults, fetchTurmaExamAnswers, gradeExamQuestion, updateTurmaExamAnswer, updateTurmaExamAttemptScore } from '@/services/adminService';
import { useAuth } from '@/hooks/useAuth';
import { useTurmaExamQuestions } from '@/hooks/useTurmaExams';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { parseExamOptions } from '@/lib/examUtils';
import { ArrowLeft, CheckCircle2, XCircle, Clock, Sparkles, Brain, RotateCcw } from 'lucide-react';

const TurmaExamResults = () => {
  const { turmaId, examId } = useParams<{ turmaId: string; examId: string }>();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attempt');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: questions = [], isLoading: questionsLoading } = useTurmaExamQuestions(examId!);

  const { data: exam } = useQuery({
    queryKey: ['turma-exam-detail', examId],
    queryFn: () => fetchTurmaExamDetail(examId!),
    enabled: !!examId,
  });

  const { data: attempt } = useQuery({
    queryKey: ['turma-exam-attempt', attemptId],
    queryFn: async () => {
      if (!attemptId) {
        // Get latest completed attempt
        const { data } = await supabase.from('turma_exam_attempts')
          .select('*').eq('exam_id', examId!).eq('user_id', user!.id)
          .eq('status', 'completed').order('completed_at', { ascending: false }).limit(1);
        return data?.[0] || null;
      }
      const { data, error } = await supabase.from('turma_exam_attempts')
        .select('*').eq('id', attemptId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!examId,
  });

  const { data: examAnswers = [] } = useQuery({
    queryKey: ['turma-exam-answers', attempt?.id],
    queryFn: async () => {
      if (!attempt?.id) return [];
      const { data, error } = await supabase.from('turma_exam_answers')
        .select('*').eq('attempt_id', attempt.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!attempt?.id,
  });

  const [gradingId, setGradingId] = useState<string | null>(null);

  const handleGradeWritten = async (questionId: string, userAnswer: string, correctAnswer: string, questionText: string) => {
    setGradingId(questionId);
    try {
      const { data, error } = await supabase.functions.invoke('grade-exam', {
        body: { questionId, userAnswer, correctAnswer, questionText, aiModel: 'flash' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const question = questions.find(q => q.id === questionId);
      const maxPoints = question?.points ?? 1;
      const scored = (data.score / 100) * maxPoints;

      // Update the answer
      const answer = examAnswers.find(a => a.question_id === questionId);
      if (answer) {
        await supabase.from('turma_exam_answers')
          .update({ scored_points: scored, is_graded: true, ai_feedback: data.feedback } as any)
          .eq('id', answer.id);
      }

      // Update attempt total
      const newTotal = examAnswers.reduce((sum, a) => {
        if (a.question_id === questionId) return sum + scored;
        return sum + (a.scored_points || 0);
      }, 0);
      if (attempt) {
        await supabase.from('turma_exam_attempts')
          .update({ scored_points: newTotal } as any)
          .eq('id', attempt.id);
      }

      toast({
        title: `Nota: ${Math.round(data.score)}%`,
        description: data.freeGradingsRemaining > 0
          ? `${data.freeGradingsRemaining} correções gratuitas restantes hoje`
          : 'Próximas correções custarão 2 Créditos IA',
      });
      // Refetch
      window.location.reload();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao corrigir', variant: 'destructive' });
    } finally {
      setGradingId(null);
    }
  };

  if (questionsLoading || !exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalPoints = attempt?.total_points || questions.reduce((s, q) => s + q.points, 0) || 1;
  const scoredPoints = attempt?.scored_points || 0;
  const percentage = Math.round((scoredPoints / totalPoints) * 100);

  const timeTaken = attempt?.completed_at && attempt?.started_at
    ? Math.floor((new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) / 1000)
    : 0;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m${s.toString().padStart(2, '0')}s`;
  };

  const ungradedWritten = questions.filter(q => {
    if (q.question_type !== 'written') return false;
    const answer = examAnswers.find(a => a.question_id === q.id);
    return answer && !answer.is_graded;
  }).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/turmas/${turmaId}`)} className="gap-1 text-muted-foreground px-2">
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
            <h2 className="font-display text-lg font-bold text-foreground mb-2">{exam.title}</h2>
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
            const answer = examAnswers.find(a => a.question_id === q.id);
            const isMC = q.question_type === 'multiple_choice';
            const options = parseExamOptions(q.options);
            const correctIndices = q.correct_indices || [];
            const selectedIndices = answer?.selected_indices || [];

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
                    answer?.is_graded
                      ? (answer.scored_points || 0) >= q.points * 0.7 ? 'bg-success/10 text-success'
                        : (answer.scored_points || 0) > 0 ? 'bg-warning/10 text-warning'
                        : 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {answer?.is_graded ? `${(answer.scored_points || 0).toFixed(1)}/${q.points}` : `0/${q.points}`} pts
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
                    {answer?.user_answer ? (
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Sua resposta</span>
                        <p className="text-sm text-foreground">{answer.user_answer}</p>
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
                    {answer?.ai_feedback && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 animate-fade-in">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Feedback IA</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{answer.ai_feedback}</p>
                      </div>
                    )}
                    {answer && !answer.is_graded && answer.user_answer && (
                      <Button variant="outline" size="sm" className="gap-1.5 w-full"
                        onClick={() => handleGradeWritten(q.id, answer.user_answer!, q.correct_answer, q.question_text)}
                        disabled={gradingId === q.id}>
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
            <Button variant="outline" onClick={() => navigate(`/turmas/${turmaId}`)} className="flex-1 gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button variant="outline" onClick={() => navigate(`/turmas/${turmaId}/exams/${examId}`)} className="flex-1 gap-2">
              <RotateCcw className="h-4 w-4" /> Refazer
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default TurmaExamResults;
