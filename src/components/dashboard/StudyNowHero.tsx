/**
 * StudyNowHero — Single dominant CTA: "Estudar Agora".
 * Shows unified queue summary + time estimate + smart session cap.
 * Triggers diagnostic on first use if 10+ unreviewed concepts.
 */
import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnifiedQueue } from '@/hooks/useUnifiedQueue';
import { Play, SquarePlus, RotateCcw, Layers, Clock, Sparkles, BrainCircuit, PartyPopper, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

const DiagnosticMode = lazy(() => import('@/components/concepts/DiagnosticMode'));

const DIAGNOSTIC_DONE_KEY = 'study-now-diagnostic-done';

function formatMinutes(m: number) {
  if (m <= 0) return '0min';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

const StudyNowHero = () => {
  const navigate = useNavigate();
  const q = useUnifiedQueue();
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const diagnosticDone = (() => {
    try { return localStorage.getItem(DIAGNOSTIC_DONE_KEY) === 'true'; } catch { return false; }
  })();

  const handleStudyNow = () => {
    // Auto-trigger diagnostic if 10+ unreviewed concepts and never done
    if (q.hasUnreviewedConcepts && !diagnosticDone) {
      setShowDiagnostic(true);
      return;
    }
    if (q.firstPendingDeckId) {
      navigate('/study/all');
    }
  };

  const handleDiagnosticClose = () => {
    setShowDiagnostic(false);
    try { localStorage.setItem(DIAGNOSTIC_DONE_KEY, 'true'); } catch {}
    // After diagnostic, start studying
    if (q.firstPendingDeckId) {
      navigate('/study/all');
    }
  };

  if (showDiagnostic) {
    return (
      <Suspense fallback={null}>
        <DiagnosticMode
          queue={[]} // Will use its own data
          onClose={handleDiagnosticClose}
        />
      </Suspense>
    );
  }

  if (q.isLoading) {
    return (
      <div className="mb-6 rounded-2xl border border-border/50 bg-card p-6 shadow-sm space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  const totalCards = q.studiedToday + q.newCards + q.learningCards + q.reviewCards;
  const progressPercent = totalCards > 0 ? Math.round((q.studiedToday / totalCards) * 100) : 0;
  const isComplete = q.totalItems === 0 && q.studiedToday > 0;
  const isEmpty = q.totalItems === 0 && q.studiedToday === 0;

  return (
    <div className="mb-6 rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
      {/* Main CTA area */}
      <div className="p-5 space-y-4">
        {isComplete ? (
          /* All done state */
          <div className="text-center py-4 space-y-3">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <PartyPopper className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Tudo em dia!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Você estudou {q.studiedToday} cards hoje. Volte amanhã!
              </p>
            </div>
            <Progress value={100} className="h-2" />
          </div>
        ) : isEmpty ? (
          /* No content state — clear actions for new users (monkey test) */
          <div className="text-center py-6 space-y-5">
            <div className="flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Bem-vindo ao Memo Cards!</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Crie seu primeiro baralho para começar a estudar.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full h-14 text-base font-bold gap-2.5 rounded-xl shadow-md"
                onClick={() => navigate('/dashboard?action=ai-deck')}
              >
                <Sparkles className="h-5 w-5" />
                Criar com IA
                <span className="text-sm font-normal opacity-80">envie PDF ou texto</span>
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-11 gap-1.5 rounded-xl"
                  onClick={() => navigate('/dashboard?action=create-deck')}
                >
                  <SquarePlus className="h-4 w-4" />
                  Criar Baralho
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-11 gap-1.5 rounded-xl"
                  onClick={() => navigate('/dashboard?action=import')}
                >
                  <Layers className="h-4 w-4" />
                  Importar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Active study state */
          <>
            {/* Study button */}
            <Button
              size="lg"
              className="w-full h-14 text-base font-bold gap-2.5 rounded-xl shadow-md"
              onClick={handleStudyNow}
            >
              <Play className="h-5 w-5" />
              Estudar Agora
              {q.isCapped ? (
                <span className="text-sm font-normal opacity-80">
                  ~{formatMinutes(q.sessionMinutes)} · {q.sessionCards} cards
                </span>
              ) : (
                <span className="text-sm font-normal opacity-80">
                  ~{formatMinutes(q.estimatedMinutes)}
                </span>
              )}
            </Button>

            {/* Progress */}
            {q.studiedToday > 0 && (
              <div className="space-y-1.5">
                <Progress value={progressPercent} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {q.studiedToday}/{totalCards} cards · {progressPercent}% concluído
                </p>
              </div>
            )}

            {/* Queue breakdown */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs">
                {q.reviewCards > 0 && (
                  <div className="flex items-center gap-1" title="Revisão">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-foreground">{q.reviewCards}</span>
                    <span className="text-muted-foreground">revisão</span>
                  </div>
                )}
                {q.learningCards > 0 && (
                  <div className="flex items-center gap-1" title="Aprendendo">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-semibold text-foreground">{q.learningCards}</span>
                    <span className="text-muted-foreground">aprendendo</span>
                  </div>
                )}
                {q.newCards > 0 && (
                  <div className="flex items-center gap-1" title="Novos">
                    <SquarePlus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{q.newCards}</span>
                    <span className="text-muted-foreground">novos</span>
                  </div>
                )}
                {q.dueThemes > 0 && (
                  <div className="flex items-center gap-1" title="Temas">
                    <BrainCircuit className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-foreground">{q.dueThemes}</span>
                    <span className="text-muted-foreground">temas</span>
                  </div>
                )}
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatMinutes(q.estimatedMinutes)}
              </span>
            </div>

            {/* Session cap notice */}
            {q.isCapped && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Sessão recomendada: <strong className="text-foreground">{formatMinutes(q.sessionMinutes)}</strong>. 
                  Você pode continuar depois.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StudyNowHero;
