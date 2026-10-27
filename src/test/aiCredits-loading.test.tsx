import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({ user: { id: 'julia' }, profile: { data: undefined as undefined | { id: string; ai_credits: number | string; ai_credits_purchased: number | string }, isError: false, refetch: vi.fn() }, claim: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => mocks.profile, profileQueryKey: (id: string) => ['profile', id] }));
vi.mock('@/services/aiCreditsService', () => ({ claimDailyAICredits: mocks.claim }));
import { useAICredits } from '@/hooks/useAICredits';
describe('AI credits initialization', () => {
  beforeEach(() => { cleanup(); mocks.profile.data = undefined; mocks.profile.isError = false; mocks.claim.mockReset().mockResolvedValue(undefined); });
  const wrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
  it('marks unknown balance as loading then sums Julia balances as numbers', () => {
    const { result, rerender } = renderHook(useAICredits, { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(true);
    mocks.profile.data = { id: 'julia', ai_credits: '26', ai_credits_purchased: '7199' };
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.credits).toBe(7225);
  });
  it('ignores the previous account daily-claim browser marker', async () => {
    localStorage.setItem('ai-credits-daily-claim', new Date().toISOString().slice(0, 10));
    renderHook(useAICredits, { wrapper: wrapper() });
    await waitFor(() => expect(mocks.claim).toHaveBeenCalledTimes(1));
  });
  it('does not treat a profile failure as a loading balance', () => {
    mocks.profile.isError = true;
    const { result } = renderHook(useAICredits, { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
  });
});