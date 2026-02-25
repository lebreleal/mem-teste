import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorCommunity {
  id: string;
  name: string;
  description: string;
  cover_image_url?: string;
  subscription_price?: number;
  member_count: number;
  subscriber_count: number;
  deck_count: number;
  pending_suggestions: number;
}

export interface CreatorStats {
  totalCommunities: number;
  totalSubscribers: number;
  totalDecks: number;
  totalCards: number;
  pendingSuggestions: number;
  monthlyRevenue: number;
}

export interface PendingSuggestion {
  id: string;
  deck_id: string;
  card_id: string | null;
  suggester_user_id: string;
  suggester_name: string;
  rationale: string;
  suggested_content: { front_content?: string; back_content?: string };
  original_content: { front_content: string; back_content: string } | null;
  created_at: string;
  deck_name: string;
  community_name: string;
}

export const useCreatorCommunities = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-communities', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: turmas } = await supabase
        .from('turmas')
        .select('*')
        .eq('owner_id', user.id);

      if (!turmas || turmas.length === 0) return [];

      const turmaIds = turmas.map((t: any) => t.id);

      // Get member counts
      const { data: members } = await supabase
        .from('turma_members')
        .select('turma_id, is_subscriber')
        .in('turma_id', turmaIds);

      // Get deck counts
      const { data: decks } = await supabase
        .from('turma_decks')
        .select('turma_id')
        .in('turma_id', turmaIds);

      // Get pending suggestions for decks in these communities
      const { data: communityDecks } = await supabase
        .from('turma_decks')
        .select('deck_id, turma_id')
        .in('turma_id', turmaIds);

      const deckIds = (communityDecks ?? []).map((d: any) => d.deck_id);
      let pendingMap = new Map<string, number>();

      if (deckIds.length > 0) {
        const { data: suggestions } = await supabase
          .from('deck_suggestions')
          .select('deck_id')
          .in('deck_id', deckIds)
          .eq('status', 'pending');

        const deckToTurma = new Map((communityDecks ?? []).map((d: any) => [d.deck_id, d.turma_id]));
        (suggestions ?? []).forEach((s: any) => {
          const tid = deckToTurma.get(s.deck_id);
          if (tid) pendingMap.set(tid, (pendingMap.get(tid) ?? 0) + 1);
        });
      }

      const result: CreatorCommunity[] = turmas.map((t: any) => {
        const tMembers = (members ?? []).filter((m: any) => m.turma_id === t.id);
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          cover_image_url: t.cover_image_url,
          subscription_price: t.subscription_price,
          member_count: tMembers.length,
          subscriber_count: tMembers.filter((m: any) => m.is_subscriber).length,
          deck_count: (decks ?? []).filter((d: any) => d.turma_id === t.id).length,
          pending_suggestions: pendingMap.get(t.id) ?? 0,
        };
      });

      return result;
    },
    enabled: !!user,
  });
};

export const useCreatorStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-stats', user?.id],
    queryFn: async (): Promise<CreatorStats> => {
      if (!user) return { totalCommunities: 0, totalSubscribers: 0, totalDecks: 0, totalCards: 0, pendingSuggestions: 0, monthlyRevenue: 0 };

      const { data: turmas } = await supabase.from('turmas').select('id').eq('owner_id', user.id);
      const turmaIds = (turmas ?? []).map((t: any) => t.id);

      if (turmaIds.length === 0) return { totalCommunities: 0, totalSubscribers: 0, totalDecks: 0, totalCards: 0, pendingSuggestions: 0, monthlyRevenue: 0 };

      const { data: members } = await supabase.from('turma_members').select('is_subscriber').in('turma_id', turmaIds);
      const { data: tDecks } = await supabase.from('turma_decks').select('deck_id').in('turma_id', turmaIds);
      const deckIds = (tDecks ?? []).map((d: any) => d.deck_id);

      let totalCards = 0;
      let pendingSuggestions = 0;
      if (deckIds.length > 0) {
        const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', deckIds);
        totalCards = count ?? 0;
        const { count: sugCount } = await supabase.from('deck_suggestions').select('id', { count: 'exact', head: true }).in('deck_id', deckIds).eq('status', 'pending');
        pendingSuggestions = sugCount ?? 0;
      }

      // Monthly revenue
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data: revenue } = await supabase
        .from('community_revenue_logs')
        .select('owner_amount')
        .eq('owner_user_id', user.id)
        .gte('created_at', startOfMonth.toISOString());

      const monthlyRevenue = (revenue ?? []).reduce((sum: number, r: any) => sum + Number(r.owner_amount || 0), 0);

      return {
        totalCommunities: turmaIds.length,
        totalSubscribers: (members ?? []).filter((m: any) => m.is_subscriber).length,
        totalDecks: deckIds.length,
        totalCards,
        pendingSuggestions,
        monthlyRevenue,
      };
    },
    enabled: !!user,
  });
};

export const usePendingSuggestions = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-pending-suggestions', user?.id],
    queryFn: async (): Promise<PendingSuggestion[]> => {
      if (!user) return [];

      // Get all decks owned by user that are shared in communities
      const { data: ownedDecks } = await supabase
        .from('decks')
        .select('id, name, community_id')
        .eq('user_id', user.id)
        .not('community_id', 'is', null);

      if (!ownedDecks || ownedDecks.length === 0) return [];

      const deckIds = ownedDecks.map((d: any) => d.id);

      const { data: suggestions } = await supabase
        .from('deck_suggestions')
        .select('*')
        .in('deck_id', deckIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!suggestions || suggestions.length === 0) return [];

      // Get suggester names
      const suggesterIds = [...new Set(suggestions.map((s: any) => s.suggester_user_id))];
      const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: suggesterIds });
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name || 'Anônimo']));

      // Get original card content
      const cardIds = suggestions.filter((s: any) => s.card_id).map((s: any) => s.card_id);
      let cardMap = new Map<string, { front_content: string; back_content: string }>();
      if (cardIds.length > 0) {
        const { data: cards } = await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds);
        (cards ?? []).forEach((c: any) => cardMap.set(c.id, { front_content: c.front_content, back_content: c.back_content }));
      }

      // Get community names
      const communityIds = [...new Set(ownedDecks.map((d: any) => d.community_id).filter(Boolean))];
      let communityMap = new Map<string, string>();
      if (communityIds.length > 0) {
        const { data: turmas } = await supabase.from('turmas').select('id, name').in('id', communityIds);
        (turmas ?? []).forEach((t: any) => communityMap.set(t.id, t.name));
      }

      const deckMap = new Map(ownedDecks.map((d: any) => [d.id, { name: d.name, community_id: d.community_id }]));

      return suggestions.map((s: any) => {
        const deck = deckMap.get(s.deck_id);
        return {
          id: s.id,
          deck_id: s.deck_id,
          card_id: s.card_id,
          suggester_user_id: s.suggester_user_id,
          suggester_name: profileMap.get(s.suggester_user_id) ?? 'Anônimo',
          rationale: s.rationale,
          suggested_content: s.suggested_content as any,
          original_content: s.card_id ? cardMap.get(s.card_id) ?? null : null,
          created_at: s.created_at,
          deck_name: deck?.name ?? 'Deck',
          community_name: communityMap.get(deck?.community_id) ?? 'Comunidade',
        };
      });
    },
    enabled: !!user,
  });
};
