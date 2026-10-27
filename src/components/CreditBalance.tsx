import { useAICredits } from '@/hooks/useAICredits';
import { formatCredits } from '@/lib/creditsFormat';

/** A missing balance is not a zero balance. */
export function CreditBalance() {
  const { credits, isLoading, isError } = useAICredits();
  if (isLoading) return <span role="status" aria-label="Carregando créditos">…</span>;
  if (isError) return <span title="Não foi possível carregar os créditos">—</span>;
  return <>{formatCredits(credits)}</>;
}