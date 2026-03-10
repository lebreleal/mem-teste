/**
 * Service layer for energy/credits system.
 */

import { supabase } from '@/integrations/supabase/client';
import type { EnergyData } from '@/types/energy';
import type { ProfileData } from '@/hooks/useProfile';
import { getToday } from '@/lib/dateUtils';

const todayStr = () => getToday();

/** Convert cached profile data to EnergyData, handling daily reset logic. */
export function profileToEnergyData(profile: ProfileData): { data: EnergyData; needsReset: boolean } {
  const today = todayStr();
  const needsReset = profile.last_study_reset_date !== today;

  return {
    data: {
      energy: profile.energy ?? 0,
      successfulCardsCounter: profile.successful_cards_counter ?? 0,
      dailyCardsStudied: needsReset ? 0 : (profile.daily_cards_studied ?? 0),
      dailyEnergyEarned: needsReset ? 0 : (profile.daily_energy_earned ?? 0),
      lastEnergyRecharge: profile.last_energy_recharge,
      lastStudyResetDate: needsReset ? today : profile.last_study_reset_date,
    },
    needsReset,
  };
}

/** Perform daily reset on server if needed. */
export async function performDailyReset(userId: string): Promise<void> {
  const today = todayStr();
  await supabase.from('profiles').update({
    daily_cards_studied: 0,
    daily_energy_earned: 0,
    last_study_reset_date: today,
  } as any).eq('id', userId);
}

/**
 * @deprecated Use profileToEnergyData() with useProfile() cache instead.
 * Kept temporarily for backward compatibility — will be removed in next cleanup.
 */
export async function fetchEnergy(userId: string): Promise<EnergyData> {
  console.warn('[DEPRECATED] fetchEnergy() called — migrate to profileToEnergyData()');
  const { data, error } = await supabase
    .from('profiles')
    .select('energy, successful_cards_counter, daily_cards_studied, daily_energy_earned, last_energy_recharge, last_study_reset_date')
    .eq('id', userId)
    .single();
  if (error) throw error;

  const d = data as any;
  let dailyCardsStudied = d?.daily_cards_studied ?? 0;
  let dailyEnergyEarned = d?.daily_energy_earned ?? 0;
  let lastStudyReset = d?.last_study_reset_date;
  const today = todayStr();

  if (lastStudyReset !== today) {
    dailyCardsStudied = 0;
    dailyEnergyEarned = 0;
    await supabase.from('profiles').update({
      daily_cards_studied: 0,
      daily_energy_earned: 0,
      last_study_reset_date: today,
    } as any).eq('id', userId);
    lastStudyReset = today;
  }

  return {
    energy: d?.energy ?? 0,
    successfulCardsCounter: d?.successful_cards_counter ?? 0,
    dailyCardsStudied,
    dailyEnergyEarned,
    lastEnergyRecharge: d?.last_energy_recharge,
    lastStudyResetDate: lastStudyReset,
  };
}

/** Add a successful card review and handle milestone bonuses. */
export async function addSuccessfulCard(
  userId: string,
  current: EnergyData,
  _flowMultiplier: number,
) {
  const newCounter = current.successfulCardsCounter + 1;
  const newDailyCards = current.dailyCardsStudied + 1;
  const newEnergy = current.energy;
  const newDailyEarned = current.dailyEnergyEarned;

  const updateData: Record<string, any> = {
    energy: newEnergy,
    successful_cards_counter: newCounter >= 10 ? 0 : newCounter,
    daily_cards_studied: newDailyCards,
    daily_energy_earned: newDailyEarned,
  };

  await supabase.from('profiles').update(updateData).eq('id', userId);

  return { energy: newEnergy, counter: newCounter >= 10 ? 0 : newCounter, earned: false, milestone: null, dailyEnergyEarned: newDailyEarned };
}

/** Spend energy/credits. */
export async function spendEnergy(userId: string, currentEnergy: number, amount: number) {
  if (currentEnergy < amount) throw new Error('Not enough energy');
  const newEnergy = currentEnergy - amount;
  await supabase.from('profiles').update({ energy: newEnergy } as any).eq('id', userId);
  return { energy: newEnergy };
}
