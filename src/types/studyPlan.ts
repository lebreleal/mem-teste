/**
 * Shared types for study plan components (Lei 3A).
 */
import type { UseMutationResult } from '@tanstack/react-query';
import type { WeeklyMinutes, WeeklyNewCards, StudyPlan, PlanMetrics } from '@/hooks/useStudyPlan';
import type { DeckWithStats } from '@/types/deck';

export interface GlobalCapacity {
  dailyMinutes: number;
  weeklyMinutes: WeeklyMinutes | null;
  dailyNewCardsLimit: number;
  weeklyNewCards: WeeklyNewCards | null;
}

export type CreatePlanMutation = UseMutationResult<void, Error, { name: string; deck_ids: string[]; target_date: string | null }>;
export type UpdatePlanMutation = UseMutationResult<void, Error, { id: string; name?: string; deck_ids?: string[]; target_date?: string | null }>;
export type DeletePlanMutation = UseMutationResult<void, Error, string>;
export type UpdateCapacityMutation = UseMutationResult<void, Error, { daily_study_minutes: number; weekly_study_minutes?: WeeklyMinutes | null; daily_new_cards_limit?: number }>;
export type UpdateNewCardsLimitMutation = UseMutationResult<void, Error, { limit: number; weeklyNewCards?: WeeklyNewCards | null }>;
export type ReorderObjectivesMutation = UseMutationResult<void, Error, string[]>;
