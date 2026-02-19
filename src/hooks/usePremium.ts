/**
 * Re-export from useSubscription for backward compatibility.
 */
import { useSubscription } from './useSubscription';

export function usePremium() {
  const { isPremium, expiresAt } = useSubscription();
  return { isPremium, expiresAt };
}
