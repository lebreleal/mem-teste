/**
 * Domain types for Decks and Cards.
 * Centralized here to be reused across hooks, services, and components.
 */

export interface DeckWithStats {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
  parent_deck_id: string | null;
  is_archived: boolean;
  new_count: number;
  learning_count: number;
  review_count: number;
  reviewed_today: number;
  new_reviewed_today: number;
  new_graduated_today: number;
  daily_new_limit: number;
  daily_review_limit: number;
  source_listing_id?: string | null;
  source_author?: string | null;
  source_turma_deck_id?: string | null;
  community_id?: string | null;
  /** The original (source) deck's updated_at timestamp, for community decks */
  source_updated_at?: string | null;
}

/** Raw card row from the cards table. */
export type { Tables } from '@/integrations/supabase/types';

import type { Tables } from '@/integrations/supabase/types';
export type CardRow = Tables<'cards'>;
