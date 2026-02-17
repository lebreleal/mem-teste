/**
 * Service layer for energy/credits system.
 */

import { supabase } from '@/integrations/supabase/client';
import type { EnergyData } from '@/types/energy';

const MAX_ENERGY = 9999;
const MILESTONE_50_BONUS = 5;
const MILESTONE_100_BONUS = 10;

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Fetch current energy data, resetting daily counters if needed. */
export async function fetchEnergy(userId: string): Promise<EnergyData> {
  const { data, error } = await supabase
    .from('profiles')
    .select('energy, successful_cards_counter, daily_cards_studied, daily_energy_earned, last_energy_recharge, last_study_reset_date')
    .eq('id', userId)
    .single();
  if (error) throw error;

  const d = data as any;
  let energy = d?.energy ?? 0;
  let dailyCardsStudied = d?.daily_cards_studied ?? 0;
  let dailyEnergyEarned = d?.daily_energy_earned ?? 0;
  let lastRecharge = d?.last_energy_recharge;
  let lastStudyReset = d?.last_study_reset_date;
  const today = todayStr();
  let needsUpdate = false;
  const updates: Record<string, any> = {};

  if (lastStudyReset !== today) {
    dailyCardsStudied = 0;
    dailyEnergyEarned = 0;
    updates.daily_cards_studied = 0;
    updates.daily_energy_earned = 0;
    updates.last_study_reset_date = today;
    lastStudyReset = today;
    needsUpdate = true;
  }

  if (needsUpdate) {
    await supabase.from('profiles').update(updates).eq('id', userId);
  }

  return {
    energy,
    successfulCardsCounter: d?.successful_cards_counter ?? 0,
    dailyCardsStudied,
    dailyEnergyEarned,
    lastEnergyRecharge: lastRecharge,
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
  let newEnergy = current.energy;
  let newDailyEarned = current.dailyEnergyEarned;
  let milestone: 50 | 100 | null = null;

  if (newDailyCards === 50) {
    newEnergy = Math.min(MAX_ENERGY, newEnergy + MILESTONE_50_BONUS);
    newDailyEarned += MILESTONE_50_BONUS;
    milestone = 50;
  } else if (newDailyCards === 100) {
    newEnergy = Math.min(MAX_ENERGY, newEnergy + MILESTONE_100_BONUS);
    newDailyEarned += MILESTONE_100_BONUS;
    milestone = 100;
  }

  const updateData: Record<string, any> = {
    energy: newEnergy,
    successful_cards_counter: newCounter >= 10 ? 0 : newCounter,
    daily_cards_studied: newDailyCards,
    daily_energy_earned: newDailyEarned,
  };

  await supabase.from('profiles').update(updateData).eq('id', userId);

  return { energy: newEnergy, counter: newCounter >= 10 ? 0 : newCounter, earned: false, milestone, dailyEnergyEarned: newDailyEarned };
}

/** Spend energy/credits. */
export async function spendEnergy(userId: string, currentEnergy: number, amount: number) {
  if (currentEnergy < amount) throw new Error('Not enough energy');
  const newEnergy = currentEnergy - amount;
  await supabase.from('profiles').update({ energy: newEnergy } as any).eq('id', userId);
  return { energy: newEnergy };
}
