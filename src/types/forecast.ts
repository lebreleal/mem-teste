/**
 * Types for the Forecast Simulator system.
 */

export type ForecastView = '7d' | '30d' | '90d' | '365d' | 'target';

export interface RatingBucket {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

export type RatingDistribution = Record<'high' | 'mid' | 'low', RatingBucket>;

export interface ForecastDeckConfig {
  id: string;
  algorithm_mode: string;
  requested_retention: number;
  max_interval: number;
  learning_steps: string[];
  daily_new_limit: number;
  daily_review_limit: number;
}

export interface ForecastCard {
  deck_id: string;
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
}

export interface ForecastTiming {
  avg_new_seconds: number;
  avg_review_seconds: number;
  avg_learning_seconds: number;
}

export interface ForecastParams {
  decks: ForecastDeckConfig[];
  cards: ForecastCard[];
  avg_new_cards_per_day: number;
  timing: ForecastTiming;
  rating_distribution: Partial<RatingDistribution>;
  total_reviews_90d: number;
}

export interface SimulatorInput {
  params: ForecastParams;
  horizonDays: number;
  newCardsPerDay: number;
  createdCardsPerDay: number;
  dailyMinutes: number;
  weeklyMinutes: Record<string, number> | null;
}

export interface ForecastPoint {
  date: string;
  day: string;
  reviewCards: number;
  newCards: number;
  learningCards: number;
  reviewMin: number;
  learningMin: number;
  newMin: number;
  totalMin: number;
  capacityMin: number;
  overloaded: boolean;
}

export interface SimulatorSummary {
  avgDailyMin: number;
  peakMin: number;
  peakDate: string;
  overloadedDays: number;
}

export interface SimulatorResult {
  points: ForecastPoint[];
  summary: SimulatorSummary;
}

export interface WorkerMessage {
  type: 'run' | 'cancel';
  input?: SimulatorInput;
}

export interface WorkerResponse {
  type: 'progress' | 'result' | 'error';
  progress?: number;
  result?: SimulatorResult;
  error?: string;
}
