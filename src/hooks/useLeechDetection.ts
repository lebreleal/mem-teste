/**
 * useLeechDetection — Leech trigger state & logic extracted from Study.tsx.
 * Copy-paste integral: no logic rewritten.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { fetchLeechStreak } from '@/services/studyService';
import { getCardConcepts, getConceptRelatedCards, generateReinforcementCards, type GlobalConcept } from '@/services/globalConceptService';

const LEECH_THRESHOLD = 3;

export type LeechInterruptionState = {
  cardId: string;
  leechKey: string;
  failCount: number;
  interruptedAt: string;
  cardSnapshot?: any;
};

export type LeechModeState = {
  leechCard: any;
  concept: GlobalConcept | null;
  reinforceCards: { id: string; front_content: string; back_content: string; deck_id: string }[];
  retryCards: { id: string; front_content: string; back_content: string; deck_id: string }[];
  currentIndex: number;
  round: number;
  flipped: boolean;
  loading?: boolean;
  isAdvancing?: boolean;
  feedback?: 'correct' | null;
  correctCount?: number;
  wrongCount?: number;
};

/**
 * Key used for leech fail counting.
 * For cloze siblings, count by shared front so repeated misses aggregate naturally.
 */
export function getLeechKey(card: { id: string; card_type: string; front_content: string }): string {
  if (card.card_type === 'cloze') {
    return `cloze:${card.front_content ?? ''}`;
  }
  return `card:${card.id}`;
}

export { LEECH_THRESHOLD };

export function useLeechDetection(deckId?: string, folderId?: string) {
  const { user } = useAuth();

  const failCountRef = useRef<Map<string, number>>(new Map());
  const leechBypassOnceRef = useRef<Set<string>>(new Set());
  const leechAdvanceLockRef = useRef(false);

  const leechFailStorageKey = useMemo(
    () => `study-leech-fails:${folderId ? `folder-${folderId}` : deckId ?? 'no-deck'}`,
    [deckId, folderId],
  );
  const leechInterruptionStorageKey = useMemo(
    () => `study-leech-interruption:${folderId ? `folder-${folderId}` : deckId ?? 'no-deck'}`,
    [deckId, folderId],
  );

  const readLeechFailCounts = useCallback(() => {
    if (typeof window === 'undefined') return new Map<string, number>();
    const parseEntries = (raw: string | null) => {
      if (!raw) return null;
      try {
        const entries = JSON.parse(raw) as unknown;
        if (!Array.isArray(entries)) return null;
        return new Map(
          entries.filter(
            (entry): entry is [string, number] =>
              Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number',
          ),
        );
      } catch {
        return null;
      }
    };

    const sessionMap = parseEntries(window.sessionStorage.getItem(leechFailStorageKey));
    if (sessionMap) return sessionMap;

    const localMap = parseEntries(window.localStorage.getItem(leechFailStorageKey));
    if (localMap) return localMap;

    return new Map<string, number>();
  }, [leechFailStorageKey]);

  const readLeechInterruption = useCallback((): LeechInterruptionState | null => {
    if (typeof window === 'undefined') return null;
    const parseValue = (raw: string | null) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<LeechInterruptionState>;
        if (
          typeof parsed?.cardId === 'string'
          && typeof parsed?.leechKey === 'string'
          && typeof parsed?.failCount === 'number'
          && typeof parsed?.interruptedAt === 'string'
        ) {
          return parsed as LeechInterruptionState;
        }
      } catch {
        return null;
      }
      return null;
    };

    const sessionValue = parseValue(window.sessionStorage.getItem(leechInterruptionStorageKey));
    if (sessionValue) return sessionValue;

    const localValue = parseValue(window.localStorage.getItem(leechInterruptionStorageKey));
    if (localValue) return localValue;

    return null;
  }, [leechInterruptionStorageKey]);

  const persistLeechFailCounts = useCallback(() => {
    if (typeof window === 'undefined') return;

    const write = (storage: Storage, value: string | null) => {
      try {
        if (value === null) storage.removeItem(leechFailStorageKey);
        else storage.setItem(leechFailStorageKey, value);
      } catch {
        // no-op: storage can be unavailable in some browser contexts
      }
    };

    const entries = Array.from(failCountRef.current.entries());
    if (entries.length === 0) {
      write(window.sessionStorage, null);
      write(window.localStorage, null);
      return;
    }

    const serialized = JSON.stringify(entries);
    write(window.sessionStorage, serialized);
    write(window.localStorage, serialized);
  }, [leechFailStorageKey]);

  const persistLeechInterruption = useCallback((value: LeechInterruptionState | null) => {
    if (typeof window === 'undefined') return;

    const write = (storage: Storage) => {
      try {
        if (!value) {
          storage.removeItem(leechInterruptionStorageKey);
          return;
        }
        storage.setItem(leechInterruptionStorageKey, JSON.stringify(value));
      } catch {
        // no-op: storage can be unavailable in some browser contexts
      }
    };

    write(window.sessionStorage);
    write(window.localStorage);
  }, [leechInterruptionStorageKey]);

  const [leechMode, setLeechMode] = useState<LeechModeState | null>(null);
  const [leechInterruption, setLeechInterruption] = useState<LeechInterruptionState | null>(null);
  const [leechSkipConfirmOpen, setLeechSkipConfirmOpen] = useState(false);

  const clearLeechInterruption = useCallback(() => {
    setLeechInterruption(null);
    setLeechSkipConfirmOpen(false);
    persistLeechInterruption(null);
  }, [persistLeechInterruption]);

  const startLeechModeForCard = useCallback(async (card: any) => {
    if (!user) return;

    leechAdvanceLockRef.current = false;

    setLeechMode({
      leechCard: card,
      concept: null,
      reinforceCards: [],
      retryCards: [],
      currentIndex: 0,
      round: 1,
      flipped: false,
      loading: true,
      isAdvancing: false,
      feedback: null,
      correctCount: 0,
      wrongCount: 0,
    });

    try {
      const concepts = await getCardConcepts(card.id, user.id);
      const weakest = concepts.length > 0 ? concepts[0] : null;
      let reinforceCards: any[] = [];

      if (weakest) {
        reinforceCards = await getConceptRelatedCards(weakest.id, user.id);
        reinforceCards = reinforceCards.filter(c => c.id !== card.id).slice(0, 10);
      }

      if (reinforceCards.length === 0) {
        const conceptName = weakest?.name ?? `${card.front_content}`.replace(/<[^>]*>/g, '').slice(0, 100);
        try {
          reinforceCards = await generateReinforcementCards(conceptName, user.id, {
            front_content: card.front_content,
            back_content: card.back_content,
          });
          reinforceCards = reinforceCards.filter(c => c.id !== card.id).slice(0, 10);
        } catch (genError) {
          console.error('Leech: AI generation failed, using fallback', genError);
        }
      }

      setLeechMode({
        leechCard: card,
        concept: weakest,
        reinforceCards,
        retryCards: [],
        currentIndex: 0,
        round: 1,
        flipped: false,
        loading: false,
        isAdvancing: false,
        feedback: null,
        correctCount: 0,
        wrongCount: 0,
      });
    } catch (err) {
      console.error('Leech: startLeechModeForCard failed', err);
      setLeechMode(prev => prev ? { ...prev, loading: false } : null);
    }
  }, [user]);

  // Restore leech fail counters for this study context
  useEffect(() => {
    failCountRef.current = readLeechFailCounts();
  }, [readLeechFailCounts]);

  // Hydrate leech count from DB for current card
  const hydrateLeechCount = useCallback(async (currentCard: any) => {
    if (!currentCard || !user || leechMode) return;
    const leechKey = getLeechKey(currentCard);
    if ((failCountRef.current.get(leechKey) ?? 0) > 0) return;
    const streak = await fetchLeechStreak(user.id, currentCard.id, LEECH_THRESHOLD - 1);
    if (streak > 0) {
      failCountRef.current.set(leechKey, streak);
      persistLeechFailCounts();
    }
  }, [user, leechMode, persistLeechFailCounts]);

  // Restore interruption modal when user closes/reopens app mid-leech flow
  const restoreInterruption = useCallback(() => {
    if (leechMode || leechInterruption) return;
    const saved = readLeechInterruption();
    if (!saved) return;
    setLeechInterruption(saved);
  }, [leechMode, leechInterruption, readLeechInterruption]);

  return {
    LEECH_THRESHOLD,
    failCountRef,
    leechBypassOnceRef,
    leechAdvanceLockRef,
    leechMode, setLeechMode,
    leechInterruption, setLeechInterruption,
    leechSkipConfirmOpen, setLeechSkipConfirmOpen,
    clearLeechInterruption,
    startLeechModeForCard,
    persistLeechFailCounts,
    persistLeechInterruption,
    hydrateLeechCount,
    restoreInterruption,
  };
}
