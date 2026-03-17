import { useState, useEffect, useRef, useCallback } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTurmaExamQuestions, useTurmaExamAttempt } from '@/hooks/useTurmaExams';
import { useTurmaRole, useTurmaMembers } from '@/hooks/useTurmaHierarchy';
import { useTurmas } from '@/hooks/useTurmas';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/hooks/useTheme';
import { useQuery } from '@tanstack/react-query';
import { fetchTurmaExamDetail, fetchActiveSubscription } from '@/services/adminService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseExamOptions } from '@/lib/examUtils';
import {
  ArrowLeft, Play, FileText, Clock, Send, Timer, Moon, Sun, CheckCircle2, Lock, RotateCcw,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const TurmaExamTake = () => {
  const { turmaId, examId } = useParams<{ turmaId: string; examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const { data: questions = [], isLoading: questionsLoading } = useTurmaExamQuestions(examId!);
  const { attempts, isLoading: attemptsLoading, startAttempt, submitAnswer, completeAttempt, restartExam } = useTurmaExamAttempt(examId!);
  const { data: myRole } = useTurmaRole(turmaId!);
  const { data: members = [] } = useTurmaMembers(turmaId!);
  const { turmas } = useTurmas();
  const turma = turmas.find(t => t.id === turmaId);

  const { data: exam } = useQuery({
    queryKey: ['turma-exam-detail', examId],
    queryFn: async () => {
      const { data, error } = await supabase.from('turma_exams').select('*').eq('id', examId!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!examId,
  });

  const { data: activeSubscription } = useQuery({
    queryKey: ['turma-active-sub', turmaId, user?.id],
    queryFn: async () => {
      if (!user || !turmaId) return null;
      const { data } = await supabase.from('turma_subscriptions').select('*')
        .eq('turma_id', turmaId).eq('user_id', user.id).gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false }).limit(1);
      return data && data.length > 0 ? data[0] : null;
    },
    enabled: !!user && !!turmaId,
  });

  const currentMember = members.find(m => m.user_id === user?.id);
  const isSubscriber = currentMember?.is_subscriber ?? false;
  const isAdmin = myRole === 'admin';
  const hasSubscription = (turma?.subscription_price ?? 0) > 0;
  const isLocked = hasSubscription && !isSubscriber && !isAdmin && !activeSubscription;
  const isSubscribersOnly = exam?.subscribers_only === true;
  const isBlockedBySubscription = isSubscribersOnly && !isSubscriber && !isAdmin && !activeSubscription;

  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mcSelections, setMcSelections] = useState<Record<string, number[]>>({});
  const [elapsed, setElapsed] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timerHidden, setTimerHidden] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Find in-progress attempt
  const inProgressAttempt = attempts.find(a => a.status === 'in_progress');
  const completedAttempts = attempts.filter(a => a.status === 'completed');

  useEffect(() => {
    if (inProgressAttempt && !currentAttemptId) {
      setCurrentAttemptId(inProgressAttempt.id);
      setStartTime(new Date(inProgressAttempt.started_at).getTime());
    }
  }, [inProgressAttempt, currentAttemptId]);

  useEffect(() => {
    if (!startTime || !currentAttemptId) return;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTime, currentAttemptId]);

  useEffect(() => {
    if (exam?.time_limit_seconds && elapsed >= exam.time_limit_seconds && currentAttemptId && !timeExpired) {
      setTimeExpired(true);
    }
  }, [elapsed, exam, currentAttemptId, timeExpired]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const timeRemaining = exam?.time_limit_seconds ? Math.max(0, exam.time_limit_seconds - elapsed) : null;
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  const handleStart = async () => {
    try {
      const result = await startAttempt.mutateAsync(totalPoints);
      setCurrentAttemptId((result as any).id);
      setStartTime(Date.now());
    } catch {
      toast({ title: 'Erro ao iniciar prova', variant: 'destructive' });
    }
  };

  const handleMcSelect = (qId: string, idx: number, multiSelect: boolean) => {
    setMcSelections(prev => {
      const current = prev[qId] || [];
      if (multiSelect) {
        return { ...prev, [qId]: current.includes(idx) ? current.filter(i => i !== idx) : [...current, idx] };
      }
      return { ...prev, [qId]: [idx] };
    });
  };

  const handleSubmit = useCallback(async () => {
    if (!currentAttemptId) return;
    setConfirmSubmit(false);
    try {
      let totalScored = 0;
      for (const q of questions) {
        let scored = 0;
        const userAnswer = answers[q.id] || '';
        const selectedIndices = mcSelections[q.id] || [];

        if (q.question_type === 'multiple_choice') {
          const correctIndices = q.correct_indices || [];
          if (selectedIndices.length === 1 && correctIndices.includes(selectedIndices[0])) {
            scored = q.points;
          }
        }
        // Written questions are scored manually or by AI later

        totalScored += scored;
        await submitAnswer.mutateAsync({
          attemptId: currentAttemptId,
          questionId: q.id,
          userAnswer: q.question_type === 'written' ? userAnswer : undefined,
          selectedIndices: q.question_type === 'multiple_choice' ? selectedIndices : undefined,
          scoredPoints: scored,
        });
      }

      await completeAttempt.mutateAsync({ attemptId: currentAttemptId, scoredPoints: totalScored });
      navigate(`/turmas/${turmaId}/exam/${examId}/results?attempt=${currentAttemptId}`, { replace: true });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao enviar prova', variant: 'destructive' });
    }
  }, [currentAttemptId, questions, answers, mcSelections, submitAnswer, completeAttempt, navigate, turmaId, examId, toast]);

  if (questionsLoading || attemptsLoading) {
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
        <Button variant="outline" onClick={() => navigate(`/turmas/${turmaId}`)} className="mt-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  // Start screen
  if (!currentAttemptId) {
    const writtenCount = questions.filter(q => q.question_type === 'written').length;
    const mcCount = questions.filter(q => q.question_type === 'multiple_choice').length;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
            <FileText className="h-10 w-10 text-primary" />
          </div>

          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{exam.title}</h1>
            {exam.description && <p className="text-sm text-muted-foreground mt-1">{exam.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{questions.length}</p>
              <p className="text-xs text-muted-foreground">Questões</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{totalPoints}</p>
              <p className="text-xs text-muted-foreground">Pontos</p>
            </div>
            {mcCount > 0 && (
              <div className="rounded-2xl border border-border/50 bg-card p-4">
                <p className="text-2xl font-bold text-primary">{mcCount}</p>
                <p className="text-xs text-muted-foreground">Objetivas</p>
              </div>
            )}
            {writtenCount > 0 && (
              <div className="rounded-2xl border border-border/50 bg-card p-4">
                <p className="text-2xl font-bold text-warning">{writtenCount}</p>
                <p className="text-xs text-muted-foreground">Dissertativas</p>
              </div>
            )}
          </div>

          {exam.time_limit_seconds && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card px-4 py-3">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Tempo limite: {formatTime(exam.time_limit_seconds)}</span>
            </div>
          )}

          {completedAttempts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Você já fez esta prova {completedAttempts.length}x. Melhor: {Math.max(...completedAttempts.map(a => a.scored_points), 0)} pts
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" 
                onClick={async () => {
                  try {
                    await restartExam.mutateAsync();
                    toast({ title: 'Prova reiniciada!' });
                  } catch {
                    toast({ title: 'Erro ao reiniciar', variant: 'destructive' });
                  }
                }}
                disabled={restartExam.isPending}>
                <RotateCcw className="h-3.5 w-3.5" /> {restartExam.isPending ? 'Reiniciando...' : 'Reiniciar Prova'}
              </Button>
            </div>
          )}

          {isLocked || isBlockedBySubscription ? (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 space-y-2">
              <Lock className="h-6 w-6 text-warning mx-auto" />
              <p className="text-sm font-semibold text-warning">Conteúdo exclusivo para assinantes</p>
              <p className="text-xs text-muted-foreground">Assine a comunidade para fazer esta prova.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">O cronômetro começará assim que você iniciar a prova.</p>
              <Button size="lg" className="w-full gap-2 h-14 text-base" onClick={handleStart} disabled={startAttempt.isPending || questions.length === 0}>
                <Play className="h-5 w-5" />
                {startAttempt.isPending ? 'Iniciando...' : 'Iniciar Prova'}
              </Button>
            </>
          )}

          <Button variant="ghost" className="gap-2" onClick={() => navigate(`/turmas/${turmaId}`)}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  // Taking exam
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/turmas/${turmaId}`)} className="gap-1 text-muted-foreground px-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-display text-sm font-bold text-foreground truncate">{exam.title}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button onClick={toggleTheme} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            {timeRemaining !== null ? (
              <button
                onClick={() => setTimerHidden(h => !h)}
                className={`flex items-center gap-1 sm:gap-1.5 rounded-xl px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold tabular-nums cursor-pointer transition-colors ${
                  timeExpired ? 'bg-destructive/10 text-destructive' : timeRemaining < 60 ? 'bg-destructive/10 text-destructive animate-pulse' : 'bg-muted text-foreground'
                }`}
                title={timerHidden ? 'Mostrar tempo' : 'Ocultar tempo'}
              >
                <Clock className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                {timerHidden ? '••:••' : timeExpired ? 'Esgotado' : formatTime(timeRemaining)}
              </button>
            ) : (
              <button
                onClick={() => setTimerHidden(h => !h)}
                className="flex items-center gap-1 sm:gap-1.5 rounded-xl bg-muted px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-muted-foreground tabular-nums cursor-pointer"
                title={timerHidden ? 'Mostrar tempo' : 'Ocultar tempo'}
              >
                <Clock className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                {timerHidden ? '••:••' : formatTime(elapsed)}
              </button>
            )}
            <Button size="sm" onClick={() => setConfirmSubmit(true)} className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <Send className="h-3 sm:h-3.5 w-3 sm:w-3.5" /> <span className="hidden sm:inline">Entregar</span><span className="sm:hidden">Enviar</span>
            </Button>
          </div>
        </div>
      </header>

      {timeExpired && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 text-center">
          <p className="text-xs font-bold text-destructive">⏰ Tempo esgotado! Você pode continuar respondendo.</p>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-2xl space-y-4 sm:space-y-6 pb-24">
          {questions.map((q, idx) => {
            const options = parseExamOptions(q.options);
            return (
              <div key={q.id} className="card-premium border border-border/40 bg-card p-4 sm:p-5" style={{ borderRadius: 'var(--radius)' }}>
                <div className="flex items-start gap-3 mb-4">
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
                      <span className="text-[10px] text-muted-foreground">{q.points} pts</span>
                    </div>
                    <div className="prose prose-sm max-w-none text-card-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} />
                  </div>
                </div>

                {q.question_type === 'written' ? (
                  <Textarea
                    placeholder="Digite sua resposta aqui"
                    className="min-h-[100px] resize-y"
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  />
                ) : (
                  <div className="space-y-2">
                    {options.map((opt, optIdx) => {
                      const isSelected = (mcSelections[q.id] || []).includes(optIdx);
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleMcSelect(q.id, optIdx, false)}
                          className={`w-full flex items-center gap-3 border-2 rounded-xl px-4 py-3 text-left transition-all ${
                            isSelected ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border bg-card hover:bg-accent/50'
                          }`}
                        >
                          <div className={`flex-shrink-0 h-5 w-5 flex items-center justify-center rounded-full border-2 transition-colors ${
                            isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/30'
                          }`}>
                            {isSelected && <CheckCircle2 className="h-3 w-3" />}
                          </div>
                          <span className="text-sm font-medium text-card-foreground">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entregar prova?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Tempo decorrido: {formatTime(elapsed)}. Após entregar, não poderá alterar respostas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Entregar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TurmaExamTake;
