/**
 * Domain types for the Feature Requests / Feedback system.
 */

export interface FeatureComment {
  id: string;
  feature_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name?: string;
}

export interface FeatureRequest {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  vote_count: number;
  created_at: string;
  updated_at: string;
  user_voted?: boolean;
  author_name?: string;
  comment_count?: number;
}

export const CATEGORIES = ['sugestao', 'problema'] as const;
export type FeatureCategory = typeof CATEGORIES[number];
