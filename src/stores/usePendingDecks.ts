/**
 * Global store for background AI deck generation tasks.
 * When user closes the dialog during generation, the task continues here.
 * When generation completes in background, cards are stored for review.
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

interface PendingDecksStore {
  pendingDecks: PendingDeck[];
  addPending: (deck: PendingDeck) => void;
  updatePending: (id: string, updates: Partial<PendingDeck>) => void;
  removePending: (id: string) => void;
}

export const usePendingDecks = create<PendingDecksStore>((set) => ({
  pendingDecks: [],
  addPending: (deck) => set((s) => ({ pendingDecks: [...s.pendingDecks, deck] })),
  updatePending: (id, updates) => set((s) => ({
    pendingDecks: s.pendingDecks.map((d) => (d.id === id ? { ...d, ...updates } : d)),
  })),
  removePending: (id) => set((s) => ({
    pendingDecks: s.pendingDecks.filter((d) => d.id !== id),
  })),
}));
