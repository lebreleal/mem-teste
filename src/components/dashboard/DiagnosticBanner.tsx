/**
 * DiagnosticBanner — Auto-shows when user has 10+ unreviewed concepts.
 * Offers to start a diagnostic test to skip already-known topics.
 */
import { useMemo, useState, lazy, Suspense } from 'react';
import { useGlobalConcepts } from '@/hooks/useGlobalConcepts';
import { BrainCircuit, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DiagnosticMode = lazy(() => import('@/components/concepts/DiagnosticMode'));

const DISMISSED_KEY = 'diagnostic-banner-dismissed';

const DiagnosticBanner = () => {
  const { concepts, isLoading } = useGlobalConcepts();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === 'true'; } catch { return false; }
  });
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const unreviewedCount = useMemo(
    () => concepts.filter(c => !c.last_reviewed_at && c.state === 0).length,
    [concepts],
  );

  const shouldShow = !isLoading && !dismissed && unreviewedCount >= 10;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch {}
  };

  if (showDiagnostic) {
    return (
      <Suspense fallback={null}>
        <DiagnosticMode
          concepts={concepts.filter(c => c.state === 0)}
          onClose={() => setShowDiagnostic(false)}
        />
      </Suspense>
    );
  }

  if (!shouldShow) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
        <BrainCircuit className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">Diagnóstico rápido disponível</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Detectamos {unreviewedCount} temas novos. Faça um teste rápido para pular o que você já sabe.
        </p>
        <Button
          size="sm"
          className="mt-2 h-7 text-xs gap-1"
          onClick={() => setShowDiagnostic(true)}
        >
          <Zap className="h-3 w-3" />
          Iniciar diagnóstico
        </Button>
      </div>
      <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default DiagnosticBanner;
