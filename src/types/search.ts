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
}
