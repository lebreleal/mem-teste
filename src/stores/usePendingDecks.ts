/**
 * Global store for background AI deck generation tasks.
 * When user closes the dialog during generation, the task continues here.
 * When generation completes in background, cards are stored for review.
 *
 * Crash/refresh recovery: the in-flight generation writes a snapshot to
 * localStorage. If the tab is reloaded mid-generation, the partial cards are
 * recovered on startup as a "review_ready" pending deck instead of being lost.
 */

import { create } from 'zustand';
import type { GeneratedCard } from '@/types/ai';

export interface PendingDeck {
  id: string;
  name: string;
  folderId: string | null;
  existingDeckId?: string | null;
  status: 'generating' | 'saving' | 'review_ready' | 'done' | 'error';
  progress: { current: number; total: number };
  /** Stored cards when generation finishes in background (for review) */
  cards?: GeneratedCard[];
  /** Sample text for AI tag suggestions */
  textSample?: string;
}

const SNAPSHOT_KEY = 'memocards:ai-gen-job';

export interface GenerationSnapshot {
  id: string;
  name: string;
  folderId: string | null;
  existingDeckId?: string | null;
  cards: GeneratedCard[];
  textSample?: string;
  progress: { current: number; total: number };
  updatedAt: number;
}

/** Persist the in-flight generation so a refresh doesn't lose partial cards. */
export function saveGenerationSnapshot(snapshot: GenerationSnapshot) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch { /* storage full or unavailable — recovery is best-effort */ }
}

export function clearGenerationSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch { /* ignore */ }
}

/** Read (and consume) a snapshot left behind by an interrupted generation. */
function consumeGenerationSnapshot(): PendingDeck[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    localStorage.removeItem(SNAPSHOT_KEY);
    const snap = JSON.parse(raw) as GenerationSnapshot;
    if (!snap?.cards?.length) return [];
    // Discard snapshots older than 24h
    if (snap.updatedAt && Date.now() - snap.updatedAt > 24 * 60 * 60 * 1000) return [];
    return [{
      id: snap.id,
      name: snap.name,
      folderId: snap.folderId ?? null,
      existingDeckId: snap.existingDeckId ?? null,
      status: 'review_ready',
      progress: snap.progress ?? { current: 0, total: 0 },
      cards: snap.cards,
      textSample: snap.textSample,
    }];
  } catch {
    return [];
  }
}

interface PendingDecksStore {
  pendingDecks: PendingDeck[];
  addPending: (deck: PendingDeck) => void;
  updatePending: (id: string, updates: Partial<PendingDeck>) => void;
  removePending: (id: string) => void;
}

export const usePendingDecks = create<PendingDecksStore>((set) => ({
  pendingDecks: consumeGenerationSnapshot(),
  addPending: (deck) => set((s) => ({ pendingDecks: [...s.pendingDecks, deck] })),
  updatePending: (id, updates) => set((s) => ({
    pendingDecks: s.pendingDecks.map((d) => (d.id === id ? { ...d, ...updates } : d)),
  })),
  removePending: (id) => set((s) => ({
    pendingDecks: s.pendingDecks.filter((d) => d.id !== id),
  })),
}));
