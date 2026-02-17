/**
 * Domain types for the personal Exam system.
 */

export interface Exam {
  id: string;
  user_id: string;
  deck_id: string;
  folder_id: string | null;
  title: string;
  status: string;
  total_points: number;
  scored_points: number;
  time_limit_seconds: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  source_turma_exam_id: string | null;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  card_id: string | null;
  question_type: string;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  correct_indices: number[] | null;
  points: number;
  user_answer: string | null;
  selected_indices: number[] | null;
  scored_points: number;
  is_graded: boolean;
  ai_feedback: string | null;
  sort_order: number;
}
