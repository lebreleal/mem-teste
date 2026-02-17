/**
 * Global store for background AI deck generation tasks.
 * When user closes the dialog during generation, the task continues here.
 */

import { create } from 'zustand';

export interface PendingDeck {
  id: string; // temporary ID
  name: string;
  folderId: string | null;
  status: 'generating' | 'saving' | 'done' | 'error';
  progress: { current: number; total: number };
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
