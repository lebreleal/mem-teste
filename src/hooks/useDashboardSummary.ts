/**
 * Consolidated dashboard bootstrap.
 *
 * Replaces the Dashboard mount fan-out (decks + folders + profile as three
 * independent round-trips) with a single `get_dashboard_summary` RPC, seeding
 * the existing React Query caches so every other hook keeps working untouched.
 */


import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { profileQueryKey } from '@/hooks/useProfile';
import { fetchDashboardSummary } from '@/services/dashboardService';

export const useDashboardSummary = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard-summary', user?.id],
    queryFn: fetchDashboardSummary,
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  const data = query.data;

  // Seed synchronously during render: an effect would only run *after* the
  // first paint, so a cache-warm remount (back navigation) rendered one frame
  // with `decks: []` — the "Nenhum baralho" flash.
  if (data && user) {
    const seeded = queryClient.getQueryData(['dashboard-summary-seed', user.id, data]);
    if (!seeded) {
      queryClient.setQueryData(['decks', user.id], data.decks);
      queryClient.setQueryData(['folders', user.id], data.folders);
      if (data.profile) queryClient.setQueryData(profileQueryKey(user.id), data.profile);
      queryClient.setQueryData(['dashboard-summary-seed', user.id, data], true);
    }
  }

  // Individual hooks stay disabled until the seed landed, so they read from
  // cache instead of firing their own duplicate requests.
  const isSeeded = !!data;

  // Treat "authenticated but not seeded yet" as loading so lists render their
  // skeleton instead of an empty state.
  return { isSeeded, isLoading: query.isLoading || (!!user && !data) };
};

