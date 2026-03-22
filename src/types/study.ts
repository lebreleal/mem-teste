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
  last_rating: number | null;
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

/** Result shape from get_study_queue_limits RPC. */
export interface StudyQueueLimitsRow {
  new_reviewed_today: number;
  review_reviewed_today: number;
}

/** Result shape from get_study_stats_summary RPC. */
export interface StudyStatsSummaryRow {
  last_study_date: string | null;
  streak: number;
  energy: number;
  daily_energy_earned: number;
  mascot_state: 'happy' | 'tired' | 'sleeping';
  today_cards: number;
  avg_minutes_7d: number;
  today_minutes: number;
  freezes_available: number;
}

/** Study plan row (minimal, for study queue). */
export interface StudyPlanRow {
  deck_ids: string[] | null;
  priority?: number;
}

/** Profile fields used during study queue building. */
export interface StudyProfileRow {
  daily_new_cards_limit: number;
  weekly_new_cards: Record<string, number> | null;
}

/** Card update payload sent to Supabase after review. */
export interface CardUpdatePayload {
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
  last_reviewed_at: string;
  learning_step: number;
  last_rating: number;
}

/** Return value of submitCardReview. */
export interface CardReviewResult {
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
  interval_days: number;
  learning_step?: number;
  movedToError: boolean;
  returnedFromError: boolean;
  originDeckName: string | null;
}

/** Row from get_activity_daily_breakdown RPC (returns a JSON object). */
export interface ActivityBreakdownResult {
  dayMap: Record<string, ActivityDayRow>;
  streak: number;
  bestStreak: number;
  totalActiveDays: number;
  freezesAvailable: number;
  freezesUsed: number;
  frozenDays: string[];
}

/** Single day entry inside ActivityBreakdownResult.dayMap. */
export interface ActivityDayRow {
  date: string;
  cards: number;
  minutes: number;
  new_cards: number;
  learning: number;
  review: number;
  relearning: number;
}

/** Row from get_hourly_breakdown RPC. */
export interface HourlyBreakdownRow {
  hour: number;
  cards: number;
  minutes: number;
}

/** Row from get_retention_over_time RPC. */
export interface RetentionRow {
  week_start: string;
  retention: number;
  total_reviews: number;
}

/** Row from get_cards_added_per_day RPC. */
export interface CardsAddedRow {
  date: string;
  count: number;
}

/** Row from get_all_user_deck_stats RPC. */
export interface DeckStatsRow {
  deck_id: string;
  new_count: number;
  learning_count: number;
  review_count: number;
  reviewed_today: number;
  new_reviewed_today: number;
  new_graduated_today: number;
}

/** Row from get_all_user_card_counts RPC. */
export interface DeckCardCountsRow {
  deck_id: string;
  total: number;
  mastered: number;
  novo: number;
  facil: number;
  bom: number;
  dificil: number;
  errei: number;
}
