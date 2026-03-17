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

/** A card row as returned by the study queue query. */
export interface StudyCard {
  id: string;
  deck_id: string;
  front_content: string;
  back_content: string;
  card_type: string;
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
  learning_step: number;
  last_reviewed_at: string | null;
  origin_deck_id: string | null;
  created_at: string;
}

/** Deck configuration fields used during study sessions. */
export interface DeckStudyConfig {
  id: string;
  name: string;
  parent_deck_id: string | null;
  folder_id: string | null;
  daily_new_limit: number;
  daily_review_limit: number;
  algorithm_mode: string;
  learning_steps: string[];
  requested_retention: number;
  max_interval: number;
  interval_modifier: number;
  easy_bonus: number;
  easy_graduating_interval: number;
  shuffle_cards: boolean;
  is_live_deck: boolean;
  source_turma_deck_id: string | null;
  source_listing_id: string | null;
  bury_siblings: boolean;
  bury_new_siblings: boolean;
  bury_review_siblings: boolean;
  bury_learning_siblings: boolean;
  is_archived: boolean;
}

export interface StudyQueueResult {
  cards: StudyCard[];
  algorithmMode: string;
  deckConfig: DeckStudyConfig | undefined;
  isLiveDeck: boolean;
}
