/**
 * Types for the Exam Create flow.
 */

export type CreationMode = 'ai' | 'manual' | 'file';
export type ManualQuestionType = 'written' | 'multiple_choice';

export interface ManualQuestion {
  id: string;
  type: ManualQuestionType;
  questionText: string;
  correctAnswer: string;
  options: string[];
  correctIndex: number;
  points: number;
}

export interface PageItem {
  pageNumber: number;
  thumbnailUrl?: string;
  textContent: string;
  selected: boolean;
}

export const createEmptyQuestion = (type: ManualQuestionType): ManualQuestion => ({
  id: crypto.randomUUID(),
  type,
  questionText: '',
  correctAnswer: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  points: type === 'written' ? 2.5 : 1.5,
});
