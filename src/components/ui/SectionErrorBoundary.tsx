import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

function SectionFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-lg border border-destructive/20 bg-destructive/5">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground text-center">
        Esta seção encontrou um erro.
      </p>
      {error instanceof Error && error.message && (
        <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-auto max-h-16 max-w-full text-left">
          {error.message}
        </pre>
      )}
      <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
        Tentar Novamente
      </Button>
    </div>
  );
}

export function SectionErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={SectionFallback}>
      {children}
    </ErrorBoundary>
  );
}
