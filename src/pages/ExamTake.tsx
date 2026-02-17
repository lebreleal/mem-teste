import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamDetail, useExams } from '@/hooks/useExams';
import { useDecks } from '@/hooks/useDecks';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Clock, Send, ArrowLeft, Play, FileText, Timer, Moon, Sun, RotateCcw } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseExamOptions } from '@/lib/examUtils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ExamTake = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { exam, questions, isLoading, submitAnswer, completeExam } = useExamDetail(examId ?? '');
  const { startExam } = useExams();
  const { decks } = useDecks();
  const { theme, toggleTheme } = useTheme();

  const { restartExam } = useExams();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mcSelections, setMcSelections] = useState<Record<string, number[]>>({});
  const [elapsed, setElapsed] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPending = exam?.status === 'pending';

  useEffect(() => {
    if (!exam || exam.status !== 'in_progress') return;
    const start = new Date(exam.started_at).getTime();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [exam]);

  useEffect(() => {
    if (exam?.time_limit_seconds && elapsed >= exam.time_limit_seconds && exam.status === 'in_progress' && !timeExpired) {
      setTimeExpired(true);
    }
  }, [elapsed, exam, timeExpired]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const timeRemaining = exam?.time_limit_seconds ? Math.max(0, exam.time_limit_seconds - elapsed) : null;

  const handleStart = async () => {
    if (!examId) return;
    try {
      await startExam.mutateAsync(examId);
    } catch {
      toast({ title: 'Erro ao iniciar prova', variant: 'destructive' });
    }
  };

  const handleWrittenChange = (qId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
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
    if (!exam) return;
    setConfirmSubmit(false);
    try {
      for (const q of questions) {
        if (q.question_type === 'written' && answers[q.id]) {
          await submitAnswer.mutateAsync({ questionId: q.id, userAnswer: answers[q.id] });
        } else if ((q.question_type === 'multiple_choice' || q.question_type === 'multi_select') && mcSelections[q.id]) {
          await submitAnswer.mutateAsync({ questionId: q.id, selectedIndices: mcSelections[q.id] });
        }
      }
      await completeExam.mutateAsync();
      navigate(`/exam/${examId}/results`, { replace: true });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao enviar prova', variant: 'destructive' });
    }
  }, [exam, questions, answers, mcSelections, submitAnswer, completeExam, examId, navigate, toast]);

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
        <Button variant="outline" onClick={() => navigate('/exam/new')} className="mt-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  if (exam.status === 'completed') {
    navigate(`/exam/${examId}/results`, { replace: true });
    return null;
  }

  // Start screen for pending exams
  if (isPending) {
    const deck = decks.find(d => d.id === exam.deck_id);
    const writtenCount = questions.filter(q => q.question_type === 'written').length;
    const mcCount = questions.filter(q => q.question_type === 'multiple_choice' || q.question_type === 'multi_select').length;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
            <FileText className="h-10 w-10 text-primary" />
          </div>

          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{exam.title}</h1>
            {deck && <p className="text-sm text-muted-foreground mt-1">{deck.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{questions.length}</p>
              <p className="text-xs text-muted-foreground">Questões</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{exam.total_points}</p>
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
              <span className="text-sm font-medium text-foreground">
                Tempo limite: {formatTime(exam.time_limit_seconds)}
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            O cronômetro começará assim que você iniciar a prova.
          </p>

          <Button size="lg" className="w-full gap-2 h-14 text-base" onClick={handleStart} disabled={startExam.isPending}>
            <Play className="h-5 w-5" />
            {startExam.isPending ? 'Iniciando...' : 'Iniciar Prova'}
          </Button>

          <Button variant="ghost" className="gap-2" onClick={() => navigate('/exam/new')}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/exam/new')} className="gap-1 text-muted-foreground px-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-display text-sm font-bold text-foreground truncate">{exam.title}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Alternar tema"
            >
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
            <Button size="sm" variant="outline" onClick={() => setConfirmRestart(true)} className="gap-1 text-xs px-2 sm:px-2.5">
              <RotateCcw className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
              <span className="hidden sm:inline">Reiniciar</span>
            </Button>
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
                        {q.question_type === 'written' ? 'Dissertativa' : q.question_type === 'multi_select' ? 'Múltipla seleção' : 'Múltipla escolha'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{q.points} pts</span>
                    </div>
                    <div className="prose prose-sm max-w-none text-card-foreground" dangerouslySetInnerHTML={{ __html: q.question_text }} />
                  </div>
                </div>

                {q.question_type === 'written' ? (
                  <Textarea
                    placeholder="Digite sua resposta aqui"
                    className="min-h-[100px] resize-y"
                    value={answers[q.id] || ''}
                    onChange={e => handleWrittenChange(q.id, e.target.value)}
                  />
                ) : (
                  <div className="space-y-2">
                    {options.map((opt, optIdx) => {
                      const isSelected = (mcSelections[q.id] || []).includes(optIdx);
                      const isMulti = q.question_type === 'multi_select';
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleMcSelect(q.id, optIdx, isMulti)}
                          className={`w-full flex items-center gap-3 border-2 rounded-xl px-4 py-3 text-left transition-all ${
                            isSelected ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border bg-card hover:bg-accent/50'
                          }`}
                        >
                          <div className={`flex-shrink-0 h-5 w-5 flex items-center justify-center border-2 transition-colors ${
                            isMulti ? 'rounded' : 'rounded-full'
                          } ${isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/30'}`}>
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

      <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar prova?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as suas respostas serão apagadas e a prova voltará ao início.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setConfirmRestart(false);
              restartExam.mutate(examId!, {
                onSuccess: () => {
                  setAnswers({});
                  setMcSelections({});
                  setElapsed(0);
                  setTimeExpired(false);
                  toast({ title: 'Prova reiniciada!' });
                },
                onError: () => toast({ title: 'Erro ao reiniciar', variant: 'destructive' }),
              });
            }}>Reiniciar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExamTake;
