/**
 * Domain types for Global Search (FTS).
 */

export interface SearchResult {
  result_type: 'deck' | 'card';
  deck_id: string;
  deck_name: string;
  parent_deck_name: string | null;
  folder_name: string | null;
  card_id: string | null;
  snippet: string;
  rank: number;
  /** Raw card content for preview (only for card results) */
  front_content: string | null;
  back_content: string | null;
  card_type: string | null;
}

export interface RecentCard {
  deck_id: string;
  deck_name: string;
  parent_deck_name: string | null;
  folder_name: string | null;
  card_id: string;
  front_content: string;
  back_content: string;
  card_type: string;
  updated_at: string;
}
