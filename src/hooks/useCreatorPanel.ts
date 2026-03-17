import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';

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

// ── Row interfaces for Supabase query results ──

interface TurmaRow {
  id: string;
  name: string;
  description: string;
  cover_image_url: string | null;
  subscription_price: number | null;
  owner_id: string;
  is_private: boolean;
  invite_code: string;
  category: string | null;
  share_slug: string | null;
  subscription_price_yearly: number | null;
  avg_rating: number | null;
  rating_count: number | null;
  created_at: string;
  updated_at: string;
}

interface TurmaMemberRow {
  turma_id: string;
  is_subscriber: boolean;
}

interface TurmaDeckRow {
  turma_id: string;
  deck_id?: string;
}

interface SuggestionDeckRow {
  deck_id: string;
}

interface PublicProfileRow {
  id: string;
  name: string | null;
}

interface SuggestionRow {
  id: string;
  deck_id: string;
  card_id: string | null;
  suggester_user_id: string;
  suggestion_type: string;
  suggested_content: Json;
  suggested_tags: Json | null;
  rationale: string;
  status: string;
  content_status: string;
  tags_status: string;
  moderator_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CardContentRow {
  id: string;
  front_content: string;
  back_content: string;
}

interface OwnedDeckRow {
  id: string;
  name: string;
  community_id: string | null;
}

interface TurmaNameRow {
  id: string;
  name: string;
}

interface RevenueRow {
  owner_amount: number;
}

interface RetentionRow {
  requested_retention: number;
}

export const useCreatorCommunities = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-communities', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: turmas } = await supabase
        .from('turmas')
        .select('id, name, description, cover_image_url, subscription_price, owner_id, is_private, invite_code, category, share_slug, subscription_price_yearly, avg_rating, rating_count, created_at, updated_at')
        .eq('owner_id', user.id);

      if (!turmas || turmas.length === 0) return [];

      const turmaIds = (turmas as TurmaRow[]).map(t => t.id);

      const { data: members } = await supabase
        .from('turma_members')
        .select('turma_id, is_subscriber')
        .in('turma_id', turmaIds);

      const { data: decks } = await supabase
        .from('turma_decks')
        .select('turma_id')
        .in('turma_id', turmaIds);

      const { data: communityDecks } = await supabase
        .from('turma_decks')
        .select('deck_id, turma_id')
        .in('turma_id', turmaIds);

      const deckIds = (communityDecks ?? []).map((d: TurmaDeckRow) => d.deck_id!);
      const pendingMap = new Map<string, number>();

      if (deckIds.length > 0) {
        const { data: suggestions } = await supabase
          .from('deck_suggestions')
          .select('deck_id')
          .in('deck_id', deckIds)
          .eq('status', 'pending');

        const deckToTurma = new Map((communityDecks ?? []).map((d: TurmaDeckRow) => [d.deck_id, d.turma_id]));
        ((suggestions ?? []) as SuggestionDeckRow[]).forEach(s => {
          const tid = deckToTurma.get(s.deck_id);
          if (tid) pendingMap.set(tid, (pendingMap.get(tid) ?? 0) + 1);
        });
      }

      const result: CreatorCommunity[] = (turmas as TurmaRow[]).map(t => {
        const tMembers = ((members ?? []) as TurmaMemberRow[]).filter(m => m.turma_id === t.id);
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          cover_image_url: t.cover_image_url ?? undefined,
          subscription_price: t.subscription_price ?? undefined,
          member_count: tMembers.length,
          subscriber_count: tMembers.filter(m => m.is_subscriber).length,
          deck_count: ((decks ?? []) as TurmaDeckRow[]).filter(d => d.turma_id === t.id).length,
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
      const turmaIds = (turmas ?? []).map((t: { id: string }) => t.id);

      if (turmaIds.length === 0) return { totalCommunities: 0, totalSubscribers: 0, totalDecks: 0, totalCards: 0, pendingSuggestions: 0, monthlyRevenue: 0 };

      const { data: members } = await supabase.from('turma_members').select('is_subscriber').in('turma_id', turmaIds);
      const { data: tDecks } = await supabase.from('turma_decks').select('deck_id').in('turma_id', turmaIds);
      const communityDeckIds = (tDecks ?? []).map((d: { deck_id: string }) => d.deck_id);

      const { data: allOwnedDecks } = await supabase.from('decks').select('id').eq('user_id', user.id);
      const allDeckIds = (allOwnedDecks ?? []).map((d: { id: string }) => d.id);

      let totalCards = 0;
      let pendingSuggestions = 0;
      if (communityDeckIds.length > 0) {
        const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).in('deck_id', communityDeckIds);
        totalCards = count ?? 0;
      }
      if (allDeckIds.length > 0) {
        const { count: sugCount } = await supabase.from('deck_suggestions').select('id', { count: 'exact', head: true }).in('deck_id', allDeckIds).eq('status', 'pending');
        pendingSuggestions = sugCount ?? 0;
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data: revenue } = await supabase
        .from('community_revenue_logs')
        .select('owner_amount')
        .eq('owner_user_id', user.id)
        .gte('created_at', startOfMonth.toISOString());

      const monthlyRevenue = ((revenue ?? []) as RevenueRow[]).reduce((sum, r) => sum + Number(r.owner_amount || 0), 0);

      return {
        totalCommunities: turmaIds.length,
        totalSubscribers: ((members ?? []) as TurmaMemberRow[]).filter(m => m.is_subscriber).length,
        totalDecks: communityDeckIds.length,
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

      const { data: ownedDecks } = await supabase
        .from('decks')
        .select('id, name, community_id')
        .eq('user_id', user.id);

      if (!ownedDecks || ownedDecks.length === 0) return [];

      const typedOwnedDecks = ownedDecks as OwnedDeckRow[];
      const deckIds = typedOwnedDecks.map(d => d.id);

      const { data: suggestions } = await supabase
        .from('deck_suggestions')
        .select('id, deck_id, card_id, suggester_user_id, suggestion_type, suggested_content, suggested_tags, rationale, status, content_status, tags_status, moderator_user_id, created_at, updated_at')
        .in('deck_id', deckIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!suggestions || suggestions.length === 0) return [];

      const typedSuggestions = suggestions as SuggestionRow[];

      const suggesterIds = [...new Set(typedSuggestions.map(s => s.suggester_user_id))];
      const { data: profiles } = await supabase.rpc('get_public_profiles', { p_user_ids: suggesterIds });
      const profileMap = new Map(((profiles ?? []) as PublicProfileRow[]).map(p => [p.id, p.name || 'Anônimo']));

      const cardIds = typedSuggestions.filter(s => s.card_id).map(s => s.card_id!);
      const cardMap = new Map<string, { front_content: string; back_content: string }>();
      if (cardIds.length > 0) {
        const { data: cards } = await supabase.from('cards').select('id, front_content, back_content').in('id', cardIds);
        ((cards ?? []) as CardContentRow[]).forEach(c => cardMap.set(c.id, { front_content: c.front_content, back_content: c.back_content }));
      }

      const communityIds = [...new Set(typedOwnedDecks.map(d => d.community_id).filter(Boolean))] as string[];
      const communityMap = new Map<string, string>();
      if (communityIds.length > 0) {
        const { data: turmas } = await supabase.from('turmas').select('id, name').in('id', communityIds);
        ((turmas ?? []) as TurmaNameRow[]).forEach(t => communityMap.set(t.id, t.name));
      }

      const deckMap = new Map(typedOwnedDecks.map(d => [d.id, { name: d.name, community_id: d.community_id }]));

      return typedSuggestions.map(s => {
        const deck = deckMap.get(s.deck_id);
        return {
          id: s.id,
          deck_id: s.deck_id,
          card_id: s.card_id,
          suggester_user_id: s.suggester_user_id,
          suggester_name: profileMap.get(s.suggester_user_id) ?? 'Anônimo',
          rationale: s.rationale,
          suggested_content: s.suggested_content as unknown as { front_content?: string; back_content?: string },
          original_content: s.card_id ? cardMap.get(s.card_id) ?? null : null,
          created_at: s.created_at,
          deck_name: deck?.name ?? 'Deck',
          community_name: communityMap.get(deck?.community_id ?? '') ?? 'Comunidade',
        };
      });
    },
    enabled: !!user,
  });
};
