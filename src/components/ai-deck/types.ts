/**
 * Shared types for the AI Deck creation flow.
 */

import type { GeneratedCard, DetailLevel, CardFormat, PageItem } from '@/types/ai';

export type Step = 'upload' | 'loading-pages' | 'pages' | 'config' | 'generating' | 'review';

export interface LoadProgress {
  current: number;
  total: number;
}

export interface GenProgress {
  current: number;
  total: number;
  creditsUsed: number;
}

// Re-export for convenience
export type { GeneratedCard, DetailLevel, CardFormat, PageItem };
