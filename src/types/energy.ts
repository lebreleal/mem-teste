/**
 * Domain types for the Energy / Credits system.
 */

export interface EnergyData {
  energy: number;
  successfulCardsCounter: number;
  dailyCardsStudied: number;
  dailyEnergyEarned: number;
  lastEnergyRecharge: string | null;
  lastStudyResetDate: string | null;
}
