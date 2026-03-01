/**
 * Domain types for the Community (Turma) system.
 */

export type TurmaRole = 'admin' | 'moderator' | 'member';

export interface Turma {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
  is_private?: boolean;
  avg_rating?: number | null;
  rating_count?: number;
  member_count?: number;
  owner_name?: string;
  cover_image_url?: string;
  subscription_price?: number;
}

export interface TurmaMember {
  user_id: string;
  role: TurmaRole;
  user_name: string;
  user_email: string;
  is_subscriber: boolean;
}

export interface TurmaMemberWithStats {
  user_id: string;
  user_name: string;
  user_email: string;
  streak: number;
  energy: number;
  mascot_state: 'happy' | 'tired' | 'sleeping';
  total_reviews: number;
}

export interface TurmaSemester {
  id: string;
  turma_id: string;
  name: string;
  description: string;
  created_by: string;
  sort_order: number;
  created_at: string;
}

export interface TurmaSubject {
  id: string;
  turma_id: string;
  semester_id: string | null;
  parent_id: string | null;
  name: string;
  description: string;
  created_by: string;
  sort_order: number;
  created_at: string;
}

export interface TurmaLesson {
  id: string;
  subject_id: string;
  turma_id: string;
  name: string;
  description: string;
  lesson_date: string | null;
  created_by: string;
  sort_order: number;
  created_at: string;
}

export interface TurmaDeck {
  id: string;
  turma_id: string;
  deck_id: string;
  subject_id: string | null;
  lesson_id: string | null;
  shared_by: string;
  price: number;
  price_type: string;
  allow_download: boolean;
  deck_name?: string;
  card_count?: number;
  parent_deck_id?: string | null;
}

export interface TurmaExam {
  id: string;
  turma_id: string;
  subject_id: string | null;
  lesson_id: string | null;
  created_by: string;
  title: string;
  description: string;
  time_limit_seconds: number | null;
  is_published: boolean;
  is_marketplace: boolean;
  price: number;
  total_questions: number;
  downloads: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  creator_name?: string;
}

export interface TurmaExamQuestion {
  id: string;
  exam_id: string;
  question_id: string | null;
  question_text: string;
  question_type: string;
  options: any;
  correct_answer: string;
  correct_indices: number[] | null;
  points: number;
  sort_order: number;
}

export interface TurmaExamAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  status: string;
  scored_points: number;
  total_points: number;
  started_at: string;
  completed_at: string | null;
}
