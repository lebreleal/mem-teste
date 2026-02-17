/**
 * Domain types for the Performance / Study Planning system.
 */

export interface CardTypeBreakdown {
  basic: number;
  cloze: number;
  multiple_choice: number;
  image_occlusion: number;
}

export interface SubjectRetention {
  subjectId: string;
  subjectName: string;
  avgRetention: number;
  totalCards: number;
  reviewCards: number;
  newCards: number;
  lastReviewAt: string | null;
  trend: 'up' | 'down' | 'stable';
  deckIds: string[];
  todayCardTypes: CardTypeBreakdown;
}

export interface PerformanceData {
  subjects: SubjectRetention[];
  totalPendingReviews: number;
  totalNewCards: number;
  upcomingExams: { id: string; title: string; daysUntil: number }[];
}
