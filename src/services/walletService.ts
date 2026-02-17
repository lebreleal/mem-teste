/**
 * Service layer for wallet (memocoins) and creator tier.
 */

import { supabase } from '@/integrations/supabase/client';
import type { WalletData, WalletTransaction, CreatorTierData } from '@/types/wallet';

/** Fetch wallet balance and recent transactions. */
export async function fetchWallet(userId: string): Promise<WalletData> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('memocoins')
    .eq('id', userId)
    .single();

  const { data: transactions } = await supabase
    .from('memocoin_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    balance: (profile as any)?.memocoins ?? 0,
    transactions: (transactions ?? []) as WalletTransaction[],
  };
}

/** Fetch and auto-evaluate creator tier. */
export async function fetchCreatorTier(userId: string): Promise<CreatorTierData> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('creator_tier')
    .eq('id', userId)
    .single();

  const currentTier = (profile as any)?.creator_tier ?? 1;

  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('id, avg_rating, rating_count, downloads')
    .eq('seller_id', userId);

  const totalListings = listings?.length ?? 0;
  const avgRating = totalListings > 0
    ? (listings ?? []).reduce((sum: number, l: any) => sum + (Number(l.avg_rating) || 0), 0) / totalListings
    : 0;
  const totalSales = (listings ?? []).reduce((sum: number, l: any) => sum + (l.downloads ?? 0), 0);

  let newTier = 1;
  if (totalListings >= 20 && avgRating >= 4.6 && totalSales >= 50) newTier = 3;
  else if (totalListings >= 5 && avgRating >= 4.0) newTier = 2;

  if (newTier !== currentTier) {
    await supabase
      .from('profiles')
      .update({ creator_tier: newTier, tier_last_evaluated: new Date().toISOString() } as any)
      .eq('id', userId);
  }

  const tier = newTier;
  const tierNames: Record<number, { name: string; badge: string }> = {
    1: { name: 'Criador Iniciante', badge: '🌱' },
    2: { name: 'Criador Confiável', badge: '⭐' },
    3: { name: 'Mestre da Turma', badge: '👑' },
  };

  const fee = tier === 3 ? 0.10 : tier === 2 ? 0.15 : 0.20;

  const nextTierProgress: { label: string; current: number; required: number }[] = [];
  if (tier < 2) {
    nextTierProgress.push(
      { label: 'Decks publicados', current: totalListings, required: 5 },
      { label: 'Avaliação média', current: Number(avgRating.toFixed(1)), required: 4.0 },
    );
  } else if (tier < 3) {
    nextTierProgress.push(
      { label: 'Decks publicados', current: totalListings, required: 20 },
      { label: 'Avaliação média', current: Number(avgRating.toFixed(1)), required: 4.6 },
      { label: 'Vendas totais', current: totalSales, required: 50 },
    );
  }

  return {
    tier,
    tierName: tierNames[tier].name,
    tierBadge: tierNames[tier].badge,
    fee,
    totalListings,
    avgRating: Number(avgRating.toFixed(1)),
    totalSales,
    nextTierProgress,
  };
}
