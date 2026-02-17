import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function usePremium() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['premium-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('premium_expires_at')
        .eq('id', user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const expiresAt = (data as any)?.premium_expires_at as string | null;
  const isPremium = !!expiresAt && new Date(expiresAt) > new Date();

  return { isPremium, expiresAt };
}
