import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  energy: number;
  memocoins: number;
  creator_tier: number;
  is_banned: boolean;
  created_at: string;
  daily_cards_studied: number;
  successful_cards_counter: number;
  onboarding_completed: boolean;
}

export interface UserDeck {
  id: string;
  name: string;
  created_at: string;
  is_archived: boolean;
  card_count: number;
}

export interface TokenUsageSummary {
  feature_key: string;
  model: string;
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens_sum: number;
  total_energy_cost: number;
}

export interface StudyDay {
  study_date: string;
  cards_reviewed: number;
  avg_rating: number;
}

export const useAdminUsers = () => {
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const fetchUsers = useCallback(async (searchTerm = '') => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_get_profiles', {
      p_search: searchTerm,
      p_limit: 50,
      p_offset: 0,
    });
    if (error) {
      toast({ title: 'Erro', description: 'Falha ao carregar usuários.', variant: 'destructive' });
    } else {
      setUsers((data as any[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchUsers]);

  const updateProfile = async (userId: string, updates: { name?: string; energy?: number; memocoins?: number; is_banned?: boolean }) => {
    const { error } = await supabase.rpc('admin_update_profile', {
      p_user_id: userId,
      p_name: updates.name ?? null,
      p_energy: updates.energy ?? null,
      p_memocoins: updates.memocoins ?? null,
      p_is_banned: updates.is_banned ?? null,
    });
    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar perfil.', variant: 'destructive' });
      return false;
    }
    toast({ title: 'Perfil atualizado!' });
    await fetchUsers(search);
    return true;
  };

  const getUserDecks = async (userId: string): Promise<UserDeck[]> => {
    const { data, error } = await supabase.rpc('admin_get_user_decks', { p_user_id: userId });
    if (error) { toast({ title: 'Erro', description: 'Falha ao carregar decks.', variant: 'destructive' }); return []; }
    return (data as any[]) || [];
  };

  const getUserTokenUsage = async (userId: string, days = 30): Promise<TokenUsageSummary[]> => {
    const { data, error } = await supabase.rpc('admin_get_user_token_usage', { p_user_id: userId, p_days: days });
    if (error) { toast({ title: 'Erro', description: 'Falha ao carregar consumo.', variant: 'destructive' }); return []; }
    return (data as any[]) || [];
  };

  const getUserStudyHistory = async (userId: string, days = 90): Promise<StudyDay[]> => {
    const { data, error } = await supabase.rpc('admin_get_user_study_history', { p_user_id: userId, p_days: days });
    if (error) { toast({ title: 'Erro', description: 'Falha ao carregar histórico.', variant: 'destructive' }); return []; }
    return (data as any[]) || [];
  };

  return { users, loading, search, setSearch, fetchUsers, updateProfile, getUserDecks, getUserTokenUsage, getUserStudyHistory };
};
