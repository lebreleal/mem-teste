/**
 * Domain types for the Study system.
 */

export interface StudyStats {
  lastStudyDate: Date | null;
  streak: number;
  energy: number;
  dailyEnergyEarned: number;
  mascotState: 'happy' | 'tired' | 'sleeping';
  todayCards: number;
  avgMinutesPerDay7d: number;
  todayMinutes: number;
  freezesAvailable: number;
}

export interface StudyQueueResult {
  cards: any[];
  algorithmMode: string;
  deckConfig: any;
  isLiveDeck: boolean;
}
