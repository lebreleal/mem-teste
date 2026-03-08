/**
 * Pure domain entities — Clean Architecture Layer 0 (Entities).
 *
 * These types represent core business concepts WITHOUT any dependency
 * on Supabase, database column names, or infrastructure details.
 * They are the "inner ring" that all other layers depend on.
 *
 * Contrast with types in `@/integrations/supabase/types.ts` which are
 * auto-generated DTOs (Data Transfer Objects) tied to the database schema.
 *
 * Mappers (below) handle the translation between DB rows and domain entities.
 */

// ─── Card Entity ───────────────────────────────

export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type CardType = 'basic' | 'cloze' | 'multiple_choice' | 'image_occlusion';

export interface Card {
  id: string;
  deckId: string;
  frontContent: string;
  backContent: string;
  cardType: CardType;
  state: CardState;
  stability: number;
  difficulty: number;
  scheduledDate: Date;
  lastReviewedAt: Date | null;
  learningStep: number;
  createdAt: Date;
}

// ─── Deck Entity ───────────────────────────────

export interface Deck {
  id: string;
  name: string;
  userId: string;
  parentDeckId: string | null;
  folderId: string | null;
  algorithmMode: 'fsrs' | 'sm2' | 'quick_review';
  dailyNewLimit: number;
  dailyReviewLimit: number;
  isArchived: boolean;
  isLiveDeck: boolean;
  requestedRetention: number;
  maxInterval: number;
  createdAt: Date;
}

// ─── Study Stats Entity ────────────────────────

export interface StudySnapshot {
  streak: number;
  freezesAvailable: number;
  todayMinutes: number;
  avgMinutes7d: number;
  todayCards: number;
  energy: number;
  dailyEnergyEarned: number;
  mascotState: 'happy' | 'tired' | 'sleeping';
  lastStudyDate: Date | null;
}

// ─── Activity Entity ───────────────────────────

export interface DayActivity {
  date: string; // yyyy-MM-dd
  totalCards: number;
  minutes: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  relearningCards: number;
}

export interface ActivitySummary {
  days: Record<string, DayActivity>;
  streak: number;
  bestStreak: number;
  totalActiveDays: number;
  freezesAvailable: number;
  freezesUsed: number;
  frozenDays: Set<string>;
}

// ─── Mappers ───────────────────────────────────
// These functions live at the boundary between infrastructure and domain.
// They convert DB rows (snake_case DTOs) into domain entities (camelCase).

const STATE_MAP: Record<number, CardState> = {
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'relearning',
};

export function mapCardState(dbState: number | null): CardState {
  return STATE_MAP[dbState ?? 0] ?? 'new';
}

export function mapCardType(dbType: string): CardType {
  if (['basic', 'cloze', 'multiple_choice', 'image_occlusion'].includes(dbType)) {
    return dbType as CardType;
  }
  return 'basic';
}

export function mapCardRow(row: any): Card {
  return {
    id: row.id,
    deckId: row.deck_id,
    frontContent: row.front_content,
    backContent: row.back_content,
    cardType: mapCardType(row.card_type),
    state: mapCardState(row.state),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    scheduledDate: new Date(row.scheduled_date),
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
    learningStep: row.learning_step ?? 0,
    createdAt: new Date(row.created_at),
  };
}

export function mapStudyStatsRow(row: any): StudySnapshot {
  return {
    streak: row.streak ?? 0,
    freezesAvailable: row.freezes_available ?? 0,
    todayMinutes: row.today_minutes ?? 0,
    avgMinutes7d: row.avg_minutes_7d ?? 0,
    todayCards: row.today_cards ?? 0,
    energy: row.energy ?? 0,
    dailyEnergyEarned: row.daily_energy_earned ?? 0,
    mascotState: row.mascot_state ?? 'sleeping',
    lastStudyDate: row.last_study_date ? new Date(row.last_study_date) : null,
  };
}

export function mapActivityBreakdown(data: any): ActivitySummary {
  const dayMap: Record<string, DayActivity> = {};
  if (data?.dayMap) {
    for (const [key, val] of Object.entries(data.dayMap as Record<string, any>)) {
      dayMap[key] = {
        date: val.date,
        totalCards: Number(val.cards) || 0,
        minutes: Number(val.minutes) || 0,
        newCards: Number(val.newCards) || 0,
        learningCards: Number(val.learning) || 0,
        reviewCards: Number(val.review) || 0,
        relearningCards: Number(val.relearning) || 0,
      };
    }
  }

  return {
    days: dayMap,
    streak: data?.streak ?? 0,
    bestStreak: data?.bestStreak ?? 0,
    totalActiveDays: data?.totalActiveDays ?? 0,
    freezesAvailable: data?.freezesAvailable ?? 0,
    freezesUsed: data?.freezesUsed ?? 0,
    frozenDays: new Set<string>((data?.frozenDays as string[]) ?? []),
  };
}
