/**
 * SessionComplete — Simple completion screen shown when queue is empty.
 * Extracted from Study.tsx (copy-paste integral).
 */

import { CheckCircle2 } from 'lucide-react';

interface SessionCompleteProps {
  reviewCount: number;
}

const SessionComplete = ({ reviewCount }: SessionCompleteProps) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="animate-fade-in text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
        <h1 className="font-display text-xl font-bold text-foreground">Seção completa!</h1>
        <p className="text-sm text-muted-foreground">{reviewCount} cards estudados</p>
      </div>
    </div>
  );
};

export default SessionComplete;
