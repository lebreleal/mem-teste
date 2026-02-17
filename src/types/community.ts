/**
 * Domain types for community preview features.
 */

export interface CreatorStats {
  totalDecks: number;
  totalCards: number;
  totalReviews: number;
  totalExams: number;
}

export interface SubjectPreview {
  id: string;
  name: string;
  lessonCount: number;
  cardCount: number;
  fileCount: number;
}

export interface RootLessonPreview {
  id: string;
  name: string;
}

export interface CommunityContentStats {
  subjects: SubjectPreview[];
  rootLessons: RootLessonPreview[];
}
