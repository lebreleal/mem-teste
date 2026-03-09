/**
 * Shared utility functions for FlashCard and MultipleChoiceCard components.
 * Extracted to eliminate code duplication.
 */

import { fsrsPreviewIntervals, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { sm2PreviewIntervals, type SM2Card, type SM2Params } from '@/lib/sm2';
import { parseStepToMinutes } from '@/lib/studyUtils';
import type { Rating } from '@/lib/fsrs';

/** Build SM2/FSRS params from deck config so preview intervals match actual scheduling */
export function buildPreviewParams(deckConfig: any, algorithmMode: string): { sm2?: SM2Params; fsrs?: FSRSParams } {
  if (!deckConfig) return {};
  const learningStepsRaw: string[] = deckConfig.learning_steps || ['1m', '10m'];
  const learningStepsMinutes = learningStepsRaw.map(parseStepToMinutes);
  const maxIntervalDays = deckConfig.max_interval ?? 36500;

  if (algorithmMode === 'fsrs') {
    const requestedRetention = deckConfig.requested_retention ?? 0.85;
    const easyGraduatingInterval = deckConfig.easy_graduating_interval ?? 15;
    return {
      fsrs: {
        ...DEFAULT_FSRS_PARAMS,
        requestedRetention,
        maximumInterval: maxIntervalDays,
        learningSteps: learningStepsMinutes,
        relearningSteps: [learningStepsMinutes[0] ?? 10],
        easyGraduatingInterval,
      },
    };
  }

  return {
    sm2: {
      learningSteps: learningStepsMinutes,
      easyBonus: (deckConfig.easy_bonus ?? 130) / 100,
      intervalModifier: (deckConfig.interval_modifier ?? 100) / 100,
      maxInterval: maxIntervalDays,
    },
  };
}

/** Compute preview intervals for a card based on algorithm mode */
export function getPreviewIntervals(
  algorithmMode: string,
  deckConfig: any,
  card: { stability: number; difficulty: number; state: number; scheduledDate: string; learningStep: number; lastReviewedAt?: string },
): Record<Rating, string> {
  const previewParams = buildPreviewParams(deckConfig, algorithmMode);
  if (algorithmMode === 'fsrs') {
    const fsrsCard: FSRSCard = {
      stability: card.stability,
      difficulty: card.difficulty,
      state: card.state,
      scheduled_date: card.scheduledDate,
      learning_step: card.learningStep,
      last_reviewed_at: card.lastReviewedAt,
    };
    return fsrsPreviewIntervals(fsrsCard, previewParams.fsrs);
  }
  const sm2Card: SM2Card = {
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    scheduled_date: card.scheduledDate,
  };
  return sm2PreviewIntervals(sm2Card, previewParams.sm2);
}

/** Get recall-based color class (semantic tokens) */
export function getRecallColor(recallData: { percent: number; state: string } | null): string {
  if (!recallData) return 'text-muted-foreground';
  if (recallData.percent >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (recallData.percent >= 60) return 'text-primary';
  if (recallData.percent >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-orange-600 dark:text-orange-400';
}

/** Get recall-based background color class */
export function getRecallBgColor(recallData: { state: string } | null): string {
  if (!recallData) return '';
  if (recallData.state === 'new') return 'bg-muted/80';
  if (recallData.state === 'learning') return 'bg-emerald-500/10';
  return 'bg-primary/10';
}

/** Difficulty data for study indicator */
export interface DifficultyData {
  value: number; // 1-10 rounded
  label: string;
  state: 'new' | 'learning' | 'review';
}

/** Get difficulty data for a card */
export function getCardDifficulty(card: { state: number; difficulty: number }): DifficultyData | null {
  const stateMap: Record<number, 'new' | 'learning' | 'review'> = { 0: 'new', 1: 'learning', 2: 'review', 3: 'learning' };
  const state = stateMap[card.state] ?? 'new';
  if (card.state === 0) return { value: 0, label: 'Novo', state };
  const d = Math.round(card.difficulty * 10) / 10;
  let label: string;
  if (d <= 3) label = 'Fácil';
  else if (d <= 5) label = 'Médio';
  else if (d <= 7) label = 'Difícil';
  else label = 'Muito difícil';
  return { value: d, label, state };
}

/** Get difficulty-based color class */
export function getDifficultyColor(data: DifficultyData | null): string {
  if (!data || data.state === 'new') return 'text-muted-foreground';
  if (data.value <= 3) return 'text-emerald-600 dark:text-emerald-400';
  if (data.value <= 5) return 'text-primary';
  if (data.value <= 7) return 'text-amber-600 dark:text-amber-400';
  return 'text-orange-600 dark:text-orange-400';
}

/** Get difficulty-based background color class */
export function getDifficultyBgColor(data: DifficultyData | null): string {
  if (!data) return '';
  if (data.state === 'new') return 'bg-muted/80';
  if (data.value <= 3) return 'bg-emerald-500/10';
  if (data.value <= 5) return 'bg-primary/10';
  if (data.value <= 7) return 'bg-amber-500/10';
  return 'bg-orange-500/10';
}
