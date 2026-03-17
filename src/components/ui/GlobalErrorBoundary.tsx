import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/errorLogger';
import type { ReactNode } from 'react';

function GlobalFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md space-y-4">
        <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold text-foreground">Ops! Algo deu errado</h1>
        <p className="text-muted-foreground">
          Um erro inesperado aconteceu. O problema já foi registrado automaticamente.
        </p>
        {error instanceof Error && error.message && (
          <pre className="text-xs text-muted-foreground bg-muted rounded-md p-3 overflow-auto max-h-24 text-left">
            {error.message}
          </pre>
        )}
        <Button onClick={resetErrorBoundary} size="lg">Tentar Novamente</Button>
      </div>
    </div>
  );
}

function handleGlobalError(error: Error, info: { componentStack?: string }) {
  logError({
    message: error.message,
    stack: error.stack ?? '',
    component: 'GlobalErrorBoundary',
    severity: 'error',
    metadata: { componentStack: info.componentStack },
  });
}

export function GlobalErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={GlobalFallback} onError={handleGlobalError}>
      {children}
    </ErrorBoundary>
  );
}
