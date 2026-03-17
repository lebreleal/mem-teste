/**
 * Shared types and constants for the DeckQuestions feature.
 */

export interface DeckQuestion {
  id: string;
  deck_id: string;
  created_by: string;
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  correct_indices: number[] | null;
  explanation: string;
  concepts: string[];
  sort_order: number;
  created_at: string;
}

export interface QuestionAttempt {
  id: string;
  question_id: string;
  user_id: string;
  selected_indices: number[] | null;
  is_correct: boolean;
  answered_at: string;
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export type QuestionFilter = 'all' | 'unanswered' | 'errors' | 'correct';

export type MasteryLevel = 'strong' | 'learning' | 'weak';

export interface QuestionStatsData {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  errorQuestionIds: Set<string>;
  answeredQuestionIds: Set<string>;
}
